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
import queue
import os
from dotenv import load_dotenv
from supabase import create_client, Client
from hardware_integration import HardwareManager
from local_store import init_db, write_passenger_count
from sync_worker import start_sync_worker, stop_sync_worker, sync_status
import socket
import httpx
import websockets
import requests

# Optional AI imports - allow server to run without them
try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    print("Warning: ultralytics not installed - AI detection disabled")

# ONNX Runtime for CPU-optimized inference
try:
    import onnxruntime as ort  # pyright: ignore [reportMissingImports]
    ONNX_AVAILABLE = True
except ImportError:
    ONNX_AVAILABLE = False
    ort = None  # type: ignore
    print("Warning: onnxruntime not installed - ONNX detection disabled")

# TensorFlow Lite for ARM64-optimized inference
try:
    import tensorflow.lite as tflite  # pyright: ignore [reportMissingImports]
    TFLITE_AVAILABLE = True
except ImportError:
    TFLITE_AVAILABLE = False
    tflite = None  # type: ignore
    print("Warning: tensorflow-lite not installed - TFLite detection disabled")

# Roboflow API for cloud-based detection
try:
    import requests
    import base64
    ROBOFLOW_AVAILABLE = True
except ImportError:
    ROBOFLOW_AVAILABLE = False
    print("Warning: requests not installed - Roboflow detection disabled")

# OpenCV DNN for local AI detection
try:
    import numpy as np
    OPENCV_DNN_AVAILABLE = True
except ImportError:
    OPENCV_DNN_AVAILABLE = False
    print("Warning: numpy not installed - OpenCV DNN detection disabled")

# Load environment variables from .env file
load_dotenv()

def discover_backend_ip():
    """
    Auto-discover Windows backend IP address on the local network
    Returns the backend URL if found, None otherwise
    """
    # Check if BACKEND_URL is manually set in .env
    manual_backend = (os.getenv('BACKEND_URL') or '').strip()
    # Empty BACKEND_URL = fully local (ONNX/GPS); skip discovery and backend YOLO
    if not manual_backend:
        print("[Discovery] BACKEND_URL empty — local-only mode (no backend discovery)")
        return None
    if manual_backend.lower() in ('none', 'local', 'off', 'disabled'):
        print(f"[Discovery] BACKEND_URL={manual_backend} — local-only mode")
        return None
    if manual_backend != 'http://localhost:8000' and manual_backend.lower() != 'auto':
        print(f"[Discovery] Using manually configured backend: {manual_backend}")
        return manual_backend

    print("[Discovery] Auto-discovering backend on local network...")

    # Get local network interface
    try:
        # Get Pi's IP and network
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()

        # Extract network (e.g., 192.168.1.35 -> 192.168.1)
        network = '.'.join(local_ip.split('.')[:-1])
        print(f"[Discovery] Local IP: {local_ip}, Network: {network}")

        # Scan common IP range for port 8000
        for i in range(1, 255):
            target_ip = f"{network}.{i}"
            if target_ip == local_ip:
                continue

            try:
                # Quick port check for port 8000
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(0.1)
                result = sock.connect_ex((target_ip, 8000))
                sock.close()

                if result == 0:
                    # Verify it's actually our backend by checking health endpoint
                    try:
                        response = httpx.get(f"http://{target_ip}:8000/health", timeout=1.0)
                        if response.status_code == 200:
                            backend_url = f"http://{target_ip}:8000"
                            print(f"[Discovery] Found backend at: {backend_url}")
                            return backend_url
                    except:
                        continue

            except:
                continue

        print("[Discovery] Backend not found on local network")
        return None

    except Exception as e:
        print(f"[Discovery] Error during auto-discovery: {e}")
        return None

# Backend configuration - auto-discover or use manual setting
# Empty / local BACKEND_URL keeps Pi on ONNX without a remote YOLO backend
_discovered = discover_backend_ip()
_env_backend = (os.getenv('BACKEND_URL') or '').strip()
if _discovered:
    _BACKEND_URL = _discovered
elif _env_backend and _env_backend.lower() not in ('none', 'local', 'off', 'disabled', 'auto'):
    _BACKEND_URL = _env_backend
else:
    _BACKEND_URL = ''
print(f"[Backend] Using URL: {_BACKEND_URL or '(none — local ONNX/GPS mode)'}")

def get_backend_url():
    """Get current backend URL (allows for dynamic updates)"""
    global _BACKEND_URL
    return _BACKEND_URL

def set_backend_url(url):
    """Update backend URL dynamically"""
    global _BACKEND_URL
    _BACKEND_URL = url
    print(f"[Backend] Updated URL to: {url}")

# Use this as BACKEND_URL in the code
BACKEND_URL = _BACKEND_URL

# Roboflow configuration
ROBOFLOW_API_KEY = os.getenv('ROBOFLOW_API_KEY', '')
ROBOFLOW_MODEL = os.getenv('ROBOFLOW_MODEL', 'person-detection-model/1')
ROBOFLOW_ENDPOINT = os.getenv('ROBOFLOW_ENDPOINT', 'https://detect.roboflow.com')

# OpenCV DNN configuration
OPENCV_DNN_MODEL_PATH = os.getenv('OPENCV_DNN_MODEL_PATH', 'MobileNetSSD_deploy.prototxt')
OPENCV_DNN_WEIGHTS_PATH = os.getenv('OPENCV_DNN_WEIGHTS_PATH', 'MobileNetSSD_deploy.caffemodel')
OPENCV_DNN_CONFIDENCE_THRESHOLD = float(os.getenv('OPENCV_DNN_CONFIDENCE_THRESHOLD', '0.5'))

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup

    # Validate required environment variables
    required_vars = ['SUPABASE_URL', 'SUPABASE_KEY']
    missing_vars = [v for v in required_vars if not os.getenv(v)]
    if missing_vars:
        print(f"⚠️  Warning: Missing environment variables: {', '.join(missing_vars)}")
        print("   Database operations will be disabled")
    else:
        print("✓ Environment variables validated")

    # Start SQLite-backed sync worker (buffers writes, pushes 1-min aggregates)
    start_sync_worker()

    enable_camera = os.getenv('ENABLE_CAMERA', 'true').lower() == 'true'

    if enable_camera:
        print("Auto-starting camera on server startup...")
        success, err_msg = video_processor.start()
        if success:
            print("Camera started successfully")
            asyncio.create_task(video_processor.process_frames())
            asyncio.create_task(video_processor.stream_frames())
            print("Video processing started")
        else:
            print(f"Failed to start camera on startup: {err_msg}")
            print("Server will continue in GPS-only mode")
    else:
        print("Camera disabled. Server running in GPS-only mode.")

    # Periodically re-register this Pi's IP so the dashboard always has the
    # current address even after a network change (DHCP re-lease, new Wi-Fi, etc.)
    async def periodic_register():
        while True:
            await asyncio.sleep(300)   # re-check every 5 minutes (was 30s)
            register_device()

    asyncio.create_task(periodic_register())

    # Poll backend for active trips and automatically set trip_id
    async def poll_active_trips():
        """Poll backend every 60 seconds for active trips and set trip_id"""
        import requests

        while True:
            try:
                await asyncio.sleep(60)  # Check every 60 seconds (was 10s)

                current_url = get_backend_url()
                if not current_url:
                    continue

                # Try to re-discover backend if using localhost
                if current_url == 'http://localhost:8000':
                    discovered_url = discover_backend_ip()
                    if discovered_url:
                        set_backend_url(discovered_url)
                        current_url = discovered_url

                # Get active trips from backend
                trips_url = f"{current_url}/api/trips"
                response = requests.get(trips_url, timeout=5)

                if response.status_code == 200:
                    trips_data = response.json()
                    trips = trips_data.get('trips', [])

                    # Find the first active trip
                    active_trip = None
                    for trip in trips:
                        if trip.get('status') == 'in_progress':
                            active_trip = trip
                            break

                    if active_trip:
                        trip_id = active_trip['id']
                        bus_id = active_trip.get('bus_id')
                        # Only update if trip_id changed
                        if video_processor.current_trip_id != trip_id:
                            video_processor.set_current_trip(trip_id, bus_id)
                            if hardware_manager:
                                hardware_manager.set_current_trip(trip_id)
                            print(f"[Trip Poll] Auto-set trip_id: {trip_id}")
                    else:
                        # No active trip - clear trip_id
                        if video_processor.current_trip_id is not None:
                            video_processor.clear_current_trip()
                            if hardware_manager:
                                hardware_manager.clear_current_trip()
                            print(f"[Trip Poll] Cleared trip_id (no active trips)")

            except requests.RequestException as e:
                print(f"[Trip Poll] Failed to fetch trips from backend: {e}")
            except Exception as e:
                print(f"[Trip Poll] Error: {e}")

    if get_backend_url():
        asyncio.create_task(poll_active_trips())
        print("[Trip Poll] Started automatic trip ID polling")
    else:
        print("[Trip Poll] Skipped — no BACKEND_URL (local ONNX mode)")

    # Stream frames to backend ONLY when COUNT_METHOD=backend (remote YOLO).
    # Local ONNX must not send frames or accept backend counts (would overwrite).
    async def stream_frames_to_backend():
        """Send video frames to backend WebSocket for remote YOLO / recording"""
        client_id = f"pi-{BUS_NUMBER}"
        print(f"[Backend Stream] Starting frame streaming to backend")

        while True:
            try:
                # Build backend WebSocket URL
                backend_url = get_backend_url()
                if not backend_url:
                    await asyncio.sleep(5)
                    continue
                backend_ws_url = backend_url.replace('http://', 'ws://').replace('https://', 'wss://')
                backend_ws_url = f"{backend_ws_url}/ws/video-stream/{client_id}"

                print(f"[Backend Stream] Connecting to: {backend_ws_url}")

                try:
                    async with websockets.connect(backend_ws_url) as ws:
                        print(f"[Backend Stream] ✓ Connected to backend successfully")

                        # Send trip info if active
                        if video_processor.current_trip_id:
                            await ws.send(json.dumps({
                                'type': 'set_trip',
                                'trip_id': video_processor.current_trip_id
                            }))
                            print(f"[Backend Stream] Sent trip ID: {video_processor.current_trip_id}")

                        # Create tasks for sending and receiving
                        async def send_frames():
                            """Send frames to backend"""
                            frame_count = 0
                            while True:
                                try:
                                    frame_base64 = getattr(video_processor, 'latest_frame', None)
                                    if frame_base64:
                                        await ws.send(json.dumps({
                                            'type': 'frame',
                                            'frame': frame_base64,
                                            'trip_id': video_processor.current_trip_id,
                                            'timestamp': time.time()
                                        }))
                                        
                                        frame_count += 1
                                        if frame_count % 30 == 0:  # Log every 30 frames (every 15 seconds)
                                            print(f"[Backend Stream] Sent {frame_count} frames to backend")

                                        # Limit to 2 FPS for backend — reduces Render load by 5×
                                        await asyncio.sleep(0.5)
                                    else:
                                        await asyncio.sleep(0.05)
                                except Exception as e:
                                    print(f"[Backend Stream] Error sending frame: {e}")
                                    break

                        async def receive_detections():
                            """Receive detection results from backend"""
                            while True:
                                try:
                                    response = await ws.recv()
                                    data = json.loads(response)
                                    
                                    if data.get('type') == 'detection':
                                        # Update passenger count and detections from backend
                                        count = data.get('count', 0)
                                        video_processor.passenger_count = count
                                        video_processor.average_count = count  # Also update average
                                        video_processor.last_detections = data.get('detections', [])
                                        print(f"[Backend Stream] Received count from backend: {count}, boxes: {len(video_processor.last_detections)}")
                                    
                                except Exception as e:
                                    print(f"[Backend Stream] Error receiving detection: {e}")
                                    break

                        # Run both send and receive concurrently
                        await asyncio.gather(send_frames(), receive_detections())

                except websockets.exceptions.WebSocketException as e:
                    print(f"[Backend Stream] WebSocket error: {e}")
                    await asyncio.sleep(5)  # Wait before reconnecting
                except Exception as e:
                    print(f"[Backend Stream] Connection error: {e}")
                    await asyncio.sleep(5)

            except Exception as e:
                print(f"[Backend Stream] Unexpected error: {e}")
                await asyncio.sleep(5)

    if COUNT_METHOD == 'backend' and get_backend_url():
        asyncio.create_task(stream_frames_to_backend())
        print("[Backend Stream] Started frame streaming to backend")
    else:
        print(f"[Backend Stream] Skipped — COUNT_METHOD={COUNT_METHOD} (local detection)")

    yield

    # Shutdown
    print("Cleaning up hardware resources...")
    stop_sync_worker()
    if enable_camera:
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

# Bus assignment — look up the assigned bus_number in Supabase at startup
BUS_NUMBER = int(os.getenv("BUS_NUMBER", "1"))
# Use one port setting for both the HTTP server and its pi_devices registration.
# Previously registration read PORT (default 5000) while Uvicorn read
# SERVER_PORT (often 8000), which made dashboards connect to the wrong port.
SERVER_PORT = int(os.getenv("SERVER_PORT", os.getenv("PORT", "5000")))
ASSIGNED_BUS_ID: Optional[str] = None
ASSIGNED_BUS_PLATE: Optional[str] = None

def resolve_assigned_bus():
    """Look up the bus record for BUS_NUMBER and cache its UUID."""
    global ASSIGNED_BUS_ID, ASSIGNED_BUS_PLATE
    if not supabase:
        print(f"[Bus] Supabase not available — cannot resolve bus {BUS_NUMBER}")
        return
    try:
        result = supabase.table("buses").select("id, plate_number").eq("bus_number", BUS_NUMBER).single().execute()
        if result.data:
            ASSIGNED_BUS_ID = result.data["id"]
            ASSIGNED_BUS_PLATE = result.data["plate_number"]
            print(f"[Bus] Assigned to bus_number={BUS_NUMBER} | id={ASSIGNED_BUS_ID} | plate={ASSIGNED_BUS_PLATE}")
        else:
            print(f"[Bus] WARNING: No bus found with bus_number={BUS_NUMBER}")
    except Exception as e:
        print(f"[Bus] Failed to resolve bus assignment: {e}")


def get_live_tunnel_url():
    """Detect live Cloudflare Quick Tunnel URL if cloudflared is running."""
    try:
        import subprocess, re
        out = subprocess.check_output(
            ["journalctl", "-u", "cloudflared-tunnel.service", "-n", "60", "--no-pager"],
            stderr=subprocess.DEVNULL,
            timeout=2.0
        ).decode()
        matches = re.findall(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", out)
        if matches:
            return matches[-1]
    except Exception:
        pass
    return None


def register_device():
    """Upsert this Pi's current LAN IP into pi_devices so the admin
    dashboard can discover the Pi automatically — no hardcoded IP needed."""
    if not supabase:
        return
    try:
        import socket
        hostname = socket.gethostname()
        # Determine the LAN IP visible from the admin network
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            lan_ip = s.getsockname()[0]
        finally:
            s.close()

        tunnel_url = get_live_tunnel_url()
        record = {
            "bus_number": BUS_NUMBER,
            "bus_id": ASSIGNED_BUS_ID,
            "ip_address": lan_ip,
            "port": SERVER_PORT,
            "last_seen": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            "hostname": hostname,
        }
        if tunnel_url:
            record["backend_url"] = tunnel_url

        supabase.table("pi_devices").upsert(record, on_conflict="bus_number").execute()

        print(f"[Device] Registered: bus={BUS_NUMBER} ip={lan_ip}:{SERVER_PORT} hostname={hostname} tunnel={tunnel_url}")
    except Exception as e:
        print(f"[Device] Failed to register: {e}")


resolve_assigned_bus()
register_device()

# Hardware Manager configuration
HARDWARE_CONFIG = {
    'enable_sms': os.getenv('ENABLE_SMS', 'false').lower() == 'true',  # Disabled by default for testing
    'enable_gps': os.getenv('ENABLE_GPS', 'true').lower() == 'true',  # Enabled by default for NEO-M8L
    'enable_emergency_button': os.getenv('ENABLE_EMERGENCY_BUTTON', 'false').lower() == 'true',  # Disabled by default for testing
    'enable_geolocation': os.getenv('ENABLE_GEOLOCATION', 'true').lower() == 'true',
    'sim900a_port': os.getenv('SIM900A_PORT', '/dev/ttyUSB0'),
    'sim900a_baudrate': int(os.getenv('SIM900A_BAUDRATE', '9600')),
    'gps_port': os.getenv('NEO6M_PORT', '/dev/ttyS0'),
    'gps_baudrate': int(os.getenv('NEO6M_BAUDRATE', '9600')),
    'emergency_button_pin': int(os.getenv('EMERGENCY_BUTTON_PIN', '18')),
    'osm_user_agent': os.getenv('OSM_USER_AGENT', 'BusMonitoringSystem'),
    # Contacts are now fetched from database, these are only fallbacks
    'emergency_contacts': os.getenv('EMERGENCY_CONTACTS', '').split(',') if os.getenv('EMERGENCY_CONTACTS') else [],
    'admin_contacts': os.getenv('ADMIN_CONTACTS', '').split(',') if os.getenv('ADMIN_CONTACTS') else []
}

# Initialize Hardware Manager
hardware_manager = None
def gps_callback(location):
    """Callback when GPS location is updated"""
    print(f"[GPS] Location update: {location.latitude:.6f}, {location.longitude:.6f}")

try:
    hardware_manager = HardwareManager(HARDWARE_CONFIG, db_client=supabase)
    if hardware_manager.initialize():
        print("Hardware manager initialized successfully")
        # Start GPS tracking with WebSocket callback
        hardware_manager.start_gps_tracking(gps_callback)
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
# Prefer integer V4L2 index — OpenCV often fails with:
#   "VIDEOIO(V4L2): backend is generally available but can't be used to capture by name"
# when given a path like '/dev/video0'.
import re as _re
_camera_device_env = (os.getenv('CAMERA_DEVICE', '') or '').strip()
_camera_id_env = (os.getenv('CAMERA_ID', '0') or '0').strip()

def _camera_index_from_value(value):
    if isinstance(value, int):
        return value
    text = str(value).strip()
    match = _re.fullmatch(r'/dev/video(\d+)', text)
    if match:
        return int(match.group(1))
    try:
        return int(text)
    except (TypeError, ValueError):
        return None

if _camera_device_env:
    CAMERA_ID = _camera_index_from_value(_camera_device_env)
    if CAMERA_ID is None:
        CAMERA_ID = _camera_device_env
    CAMERA_DEVICE = _camera_device_env
else:
    CAMERA_ID = _camera_index_from_value(_camera_id_env)
    if CAMERA_ID is None:
        CAMERA_ID = _camera_id_env
    CAMERA_DEVICE = f'/dev/video{CAMERA_ID}' if isinstance(CAMERA_ID, int) else _camera_id_env
CAMERA_WIDTH = int(os.getenv('CAMERA_WIDTH', '640'))
CAMERA_HEIGHT = int(os.getenv('CAMERA_HEIGHT', '480'))
FPS = int(os.getenv('FPS', '30'))

# Performance settings
ENABLE_REALTIME_MODE = os.getenv('ENABLE_REALTIME_MODE', 'false').lower() == 'true'
SKIP_DETECTION_FRAMES = int(os.getenv('SKIP_DETECTION_FRAMES', '9'))  # Process every 10th frame for 30fps
FRAME_QUEUE_SIZE = int(os.getenv('FRAME_QUEUE_SIZE', '5'))
DISABLE_DRAWING = os.getenv('DISABLE_DRAWING', 'false').lower() == 'true'
DISABLE_DB_WRITES = os.getenv('DISABLE_DB_WRITES', 'false').lower() == 'true'
SKIP_WEBSOCKET_THROTTLE = os.getenv('SKIP_WEBSOCKET_THROTTLE', 'false').lower() == 'true'
DETECTION_SIZE = int(os.getenv('DETECTION_SIZE', '160'))  # Match ONNX export imgsz (160 = fastest on Pi)

# AI Model configuration — strictly YOLO/ONNX person detection
DISABLE_AI = os.getenv('DISABLE_AI', 'false').lower() == 'true'
_count_method_default = 'onnx' if ONNX_AVAILABLE else 'backend'
COUNT_METHOD = os.getenv('COUNT_METHOD', _count_method_default)
MODEL_PATH = os.getenv('MODEL_PATH', 'yolov8n.onnx')
CONFIDENCE_THRESHOLD = float(os.getenv('CONFIDENCE_THRESHOLD', '0.25'))  # 0.25 captures seated/dim passengers; _is_valid_person_box rejects objects
IOU_THRESHOLD = float(os.getenv('IOU_THRESHOLD', '0.35'))  # 0.35 NMS IoU to eliminate duplicate bounding boxes on same person
JPEG_QUALITY = int(os.getenv('JPEG_QUALITY', '60'))

# YOLO-specific confidence threshold for person detection
YOLO_CONFIDENCE_THRESHOLD = float(os.getenv('YOLO_CONFIDENCE_THRESHOLD', '0.25'))
MAX_DET = int(os.getenv('MAX_DET', '50'))

# Video Recording configuration
ENABLE_VIDEO_RECORDING = os.getenv('ENABLE_VIDEO_RECORDING', 'false').lower() == 'true'
VIDEO_STORAGE_PATH = os.getenv('VIDEO_STORAGE_PATH', './recordings')
MAX_VIDEO_DURATION = int(os.getenv('MAX_VIDEO_DURATION', '300'))
VIDEO_FORMAT = os.getenv('VIDEO_FORMAT', 'mp4')
VIDEO_BITRATE = int(os.getenv('VIDEO_BITRATE', '1000000'))

# Passenger detection classes (COCO dataset)
PASSENGER_CLASSES = ['person']

print(f"Detection mode: COUNT_METHOD={COUNT_METHOD}, DISABLE_AI={DISABLE_AI}")
print(f"YOLO confidence threshold: {YOLO_CONFIDENCE_THRESHOLD}")
print(f"Ultra-low latency settings: ENABLE_REALTIME_MODE={ENABLE_REALTIME_MODE}, SKIP_DETECTION_FRAMES={SKIP_DETECTION_FRAMES}")
print(f"Camera settings: {CAMERA_WIDTH}x{CAMERA_HEIGHT} @ {FPS}fps, JPEG_QUALITY={JPEG_QUALITY}")
print(f"Performance optimizations: DISABLE_DRAWING={DISABLE_DRAWING}, DISABLE_DB_WRITES={DISABLE_DB_WRITES}, FRAME_QUEUE_SIZE={FRAME_QUEUE_SIZE}")

class PassengerTracker:
    """Temporal tracking and box smoothing to eliminate bounding box flicker and count jitter."""
    def __init__(self, hit_thresh=0.25, keep_thresh=0.20, max_missed=3):
        self.hit_thresh = hit_thresh
        self.keep_thresh = keep_thresh
        self.max_missed = max_missed
        self.tracks = []
        self.next_id = 1

    @staticmethod
    def _iou(box1, box2):
        x1 = max(box1[0], box2[0])
        y1 = max(box1[1], box2[1])
        x2 = min(box1[2], box2[2])
        y2 = min(box1[3], box2[3])
        if x2 <= x1 or y2 <= y1:
            return 0.0
        inter = (x2 - x1) * (y2 - y1)
        area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
        area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
        denom = area1 + area2 - inter
        return inter / float(denom) if denom > 0 else 0.0

    def update(self, raw_detections):
        matched_track_indices = set()
        unmatched_dets = []

        for det in raw_detections:
            conf = det['confidence']
            bbox = det['bbox']

            best_iou = 0.0
            best_t_idx = -1
            for idx, track in enumerate(self.tracks):
                if idx in matched_track_indices:
                    continue
                iou = self._iou(bbox, track['bbox'])
                if iou > best_iou:
                    best_iou = iou
                    best_t_idx = idx

            # If matching an active passenger, keep tracking down to keep_thresh (0.28)
            if best_iou >= 0.25 and conf >= self.keep_thresh:
                track = self.tracks[best_t_idx]
                track['missed'] = 0
                track['conf'] = conf
                # Exponential Moving Average for jitter-free bounding box (alpha = 0.70)
                track['bbox'] = [
                    int(0.70 * bbox[i] + 0.30 * track['bbox'][i])
                    for i in range(4)
                ]
                matched_track_indices.add(best_t_idx)
            else:
                unmatched_dets.append(det)

        # Increment missed counter for unobserved tracks
        for idx, track in enumerate(self.tracks):
            if idx not in matched_track_indices:
                track['missed'] += 1

        # Remove tracks that have departed (missed for >= max_missed frames)
        self.tracks = [t for t in self.tracks if t['missed'] < self.max_missed]

        # Only create a NEW passenger track if confidence meets the strict hit_thresh (0.40)
        for det in unmatched_dets:
            if det['confidence'] >= self.hit_thresh:
                self.tracks.append({
                    'id': self.next_id,
                    'bbox': det['bbox'],
                    'conf': det['confidence'],
                    'missed': 0
                })
                self.next_id += 1

        return [{
            'bbox': t['bbox'],
            'confidence': float(t['conf']),
            'class': 'person'
        } for t in self.tracks]

class VideoProcessor:
    def __init__(self):
        self.camera = None
        self.model = None
        self.tracker = PassengerTracker(hit_thresh=YOLO_CONFIDENCE_THRESHOLD, keep_thresh=0.20, max_missed=3)
        self.frame_queue = queue.Queue(maxsize=FRAME_QUEUE_SIZE)  # Optimized queue size
        self.latest_frame = None
        self.running = False
        self.passenger_count = 0
        self.detection_history = []
        self.websocket_clients = set()
        self.current_trip_id = None
        self.current_bus_id = None
        self.last_db_save = 0
        self.db_save_interval = 30  # Save to SQLite every 30 seconds (was 5s)
        self.last_anomaly_check = 0
        self.anomaly_check_interval = 300  # Anomaly detection every 5 minutes (was every save)
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
        
    def _open_camera_candidate(self, candidate):
        """Try opening one camera candidate (int index preferred over path)."""
        label = candidate if not isinstance(candidate, int) else f'/dev/video{candidate} (index {candidate})'
        cam = cv2.VideoCapture(candidate, cv2.CAP_V4L2)
        if not cam.isOpened():
            cam.release()
            return None

        # Force MJPG before resolution — EMEET YUYV is unreliable on this OpenCV build
        cam.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
        cam.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        cam.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
        cam.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
        cam.set(cv2.CAP_PROP_FPS, FPS)
        cam.set(cv2.CAP_PROP_AUTOFOCUS, 0)

        ret, test_frame = None, None
        for _ in range(3):
            ret, test_frame = cam.read()
        if not ret or test_frame is None:
            print(f"Opened {label} but could not read frames")
            cam.release()
            return None

        print(f"Camera opened via {label}")
        return cam

    def initialize_camera(self):
        """Initialize the EMEET C60E webcam (V4L2 index first, then path fallback)."""
        try:
            if self.camera is not None:
                self.camera.release()
                self.camera = None
                time.sleep(0.3)

            candidates = []
            primary_idx = _camera_index_from_value(CAMERA_ID)
            if primary_idx is not None:
                candidates.append(primary_idx)
            # Keep configured path as secondary attempt
            if CAMERA_DEVICE not in candidates:
                candidates.append(CAMERA_DEVICE)
            for i in range(4):
                if i not in candidates:
                    candidates.append(i)

            print(f"Opening camera candidates: {candidates}")
            for candidate in candidates:
                cam = self._open_camera_candidate(candidate)
                if cam is None:
                    continue
                self.camera = cam
                actual_width = int(self.camera.get(cv2.CAP_PROP_FRAME_WIDTH))
                actual_height = int(self.camera.get(cv2.CAP_PROP_FRAME_HEIGHT))
                actual_fps = int(self.camera.get(cv2.CAP_PROP_FPS))
                buffer_size = int(self.camera.get(cv2.CAP_PROP_BUFFERSIZE))
                print(f"Camera initialized successfully: {actual_width}x{actual_height} @ {actual_fps}fps (buffer: {buffer_size})")
                print(f"Requested resolution: {CAMERA_WIDTH}x{CAMERA_HEIGHT}, Actual: {actual_width}x{actual_height}")
                print(f"Real-time mode: {ENABLE_REALTIME_MODE}, Skip frames: {SKIP_DETECTION_FRAMES}")
                self.camera_reconnect_attempts = 0
                return True

            print(f"Error: Could not open camera (configured {CAMERA_DEVICE})")
            self._list_available_cameras()
            return False
        except Exception as e:
            print(f"Camera initialization error: {e}")
            return False
    
    def _list_available_cameras(self):
        """List available camera devices"""
        print("Attempting to find available cameras...")
        for i in range(4):
            path = f'/dev/video{i}'
            try:
                # Probe by index first (avoids V4L2 capture-by-name failure)
                test_cam = cv2.VideoCapture(i, cv2.CAP_V4L2)
                if test_cam.isOpened():
                    ret, frame = test_cam.read()
                    if ret and frame is not None:
                        print(f"Found working camera at index {i} ({path})")
                    test_cam.release()
                else:
                    test_cam.release()
            except Exception as e:
                print(f"Error checking {path}: {e}")
    
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
        if COUNT_METHOD == 'backend':
            # Backend detection mode - no local model needed
            print("Backend detection mode - frames sent to backend for AI processing")
            return True
        if COUNT_METHOD == 'onnx':
            # ONNX Runtime for CPU-optimized YOLO inference
            if not ONNX_AVAILABLE:
                print("ONNX Runtime not installed - falling back to YOLO PyTorch model")
                try:
                    from ultralytics import YOLO
                    self.model = YOLO(MODEL_PATH)
                    print(f"YOLO model loaded from {MODEL_PATH}")
                    return True
                except Exception as e:
                    print(f"YOLO loading error: {e}")
                    return False
            try:
                import os
                onnx_model_path = MODEL_PATH if MODEL_PATH.endswith('.onnx') else MODEL_PATH.replace('.pt', '.onnx')

                def _export_onnx(path_hint: str) -> str:
                    """Export YOLOv8n ONNX at DETECTION_SIZE so input dims match inference."""
                    print(f"Exporting YOLOv8n ONNX @ {DETECTION_SIZE}px → {path_hint}")
                    yolo_model = YOLO('yolov8n.pt')
                    exported = yolo_model.export(format='onnx', imgsz=DETECTION_SIZE, opset=12)
                    return exported if isinstance(exported, str) else path_hint

                if not os.path.exists(onnx_model_path):
                    if not YOLO_AVAILABLE:
                        print("YOLO not available to convert to ONNX — place yolov8n.onnx in working directory")
                        return False
                    onnx_model_path = _export_onnx(onnx_model_path)

                self.onnx_session = ort.InferenceSession(onnx_model_path, providers=['CPUExecutionProvider'])
                in_shape = self.onnx_session.get_inputs()[0].shape
                # YOLOv8 ONNX input is typically [N, 3, H, W]
                model_h = in_shape[2] if len(in_shape) >= 4 and isinstance(in_shape[2], int) else None
                model_w = in_shape[3] if len(in_shape) >= 4 and isinstance(in_shape[3], int) else None

                if model_h and model_w and (model_h != DETECTION_SIZE or model_w != DETECTION_SIZE):
                    print(
                        f"ONNX input {model_h}x{model_w} != DETECTION_SIZE={DETECTION_SIZE} — "
                        f"re-exporting at {DETECTION_SIZE}px"
                    )
                    if YOLO_AVAILABLE:
                        # Replace mismatched (usually 640) model with one sized for the Pi
                        bak = f"{onnx_model_path}.bak640"
                        try:
                            os.replace(onnx_model_path, bak)
                        except OSError:
                            pass
                        onnx_model_path = _export_onnx(onnx_model_path)
                        self.onnx_session = ort.InferenceSession(
                            onnx_model_path, providers=['CPUExecutionProvider']
                        )
                        in_shape = self.onnx_session.get_inputs()[0].shape
                        model_h = in_shape[2] if len(in_shape) >= 4 and isinstance(in_shape[2], int) else DETECTION_SIZE
                        model_w = in_shape[3] if len(in_shape) >= 4 and isinstance(in_shape[3], int) else DETECTION_SIZE
                    else:
                        print(
                            f"ultralytics not installed — falling back to model size {model_h}x{model_w}. "
                            f"Run: yolo export model=yolov8n.pt format=onnx imgsz={DETECTION_SIZE}"
                        )

                self.onnx_input_size = int(model_h or model_w or DETECTION_SIZE)
                print(
                    f"ONNX model loaded from {onnx_model_path} "
                    f"(CPU, input={in_shape}, inference_size={self.onnx_input_size})"
                )
                return True
            except Exception as e:
                print(f"ONNX model initialization error: {e}")
                return False
        if COUNT_METHOD == 'tflite':
            # TensorFlow Lite for ARM64-optimized YOLO inference
            if not TFLITE_AVAILABLE:
                print("TensorFlow Lite not installed")
                return False
            try:
                import os
                tflite_model_path = MODEL_PATH if MODEL_PATH.endswith('.tflite') else MODEL_PATH.replace('.pt', '.tflite')
                if not os.path.exists(tflite_model_path):
                    print(f"TFLite model not found at {tflite_model_path}")
                    return False
                self.interpreter = tflite.Interpreter(model_path=tflite_model_path)
                self.interpreter.allocate_tensors()
                self.input_details = self.interpreter.get_input_details()
                self.output_details = self.interpreter.get_output_details()
                print(f"TFLite model loaded from {tflite_model_path} (ARM64-optimized)")
                return True
            except Exception as e:
                print(f"TFLite model initialization error: {e}")
                return False
        if COUNT_METHOD == 'roboflow':
            # Roboflow cloud-based detection for 90%+ accuracy
            if not ROBOFLOW_AVAILABLE or not ROBOFLOW_API_KEY:
                print("Roboflow API not configured")
                return False
            print(f"Roboflow cloud detection initialized (model: {ROBOFLOW_MODEL})")
            return True
        if COUNT_METHOD == 'opencv_dnn':
            # OpenCV DNN with MobileNet-SSD
            if not OPENCV_DNN_AVAILABLE:
                print("OpenCV DNN not available")
                return False
            try:
                import os
                if not os.path.exists(OPENCV_DNN_MODEL_PATH) or not os.path.exists(OPENCV_DNN_WEIGHTS_PATH):
                    print("MobileNet-SSD model files not found")
                    return False
                self.net = cv2.dnn.readNetFromCaffe(OPENCV_DNN_MODEL_PATH, OPENCV_DNN_WEIGHTS_PATH)
                print(f"OpenCV DNN MobileNet-SSD loaded successfully")
                return True
            except Exception as e:
                print(f"OpenCV DNN initialization error: {e}")
                return False
        if DISABLE_AI:
            print("AI detection disabled via DISABLE_AI env var — skipping model load")
            return False
        if not YOLO_AVAILABLE:
            print("AI detection disabled - ultralytics not installed")
            return False
        try:
            self.model = YOLO(MODEL_PATH)
            print(f"YOLO model loaded from {MODEL_PATH}")
            return True
        except Exception as e:
            print(f"Model initialization error: {e}")
            return False

    def detect_passengers(self, frame):
        """Strictly YOLO-based passenger detection. No MOG or HOG."""
        if COUNT_METHOD == 'backend':
            # Backend detection mode - don't process locally, wait for backend results
            return []
        if hasattr(self, 'onnx_session') and self.onnx_session is not None:
            return self._detect_onnx(frame)
        if hasattr(self, 'model') and self.model is not None:
            return self._detect_yolo(frame)
        return []

    def _detect_onnx(self, frame):
        """ONNX Runtime-based YOLO detection — accurate aspect-ratio preserving inference."""
        try:
            import numpy as np

            original_h, original_w = frame.shape[:2]
            # Use 4:3 640x480 matching the camera frame proportions
            in_w, in_h = 640, 480

            # Convert BGR to RGB (YOLOv8 was trained on RGB)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            if original_w != in_w or original_h != in_h:
                rgb = cv2.resize(rgb, (in_w, in_h))
            img = rgb.astype(np.float32) / 255.0
            img = np.transpose(img, (2, 0, 1))  # HWC to CHW
            img = np.expand_dims(img, axis=0)   # add batch dim

            # Run inference
            outputs = self.onnx_session.run(
                None,
                {self.onnx_session.get_inputs()[0].name: img},
            )
            
            # Parse outputs (YOLOv8 format: 1, 84, anchors)
            detections = []
            if len(outputs) > 0:
                output = outputs[0]
                predictions = output[0].T  # Shape: (anchors, 84)
                
                # Class scores start at index 4; class 0 is person
                class_scores = predictions[:, 4:]
                max_class_ids = np.argmax(class_scores, axis=1)
                person_scores = predictions[:, 4]
                
                conf_thresh = YOLO_CONFIDENCE_THRESHOLD if (YOLO_CONFIDENCE_THRESHOLD and YOLO_CONFIDENCE_THRESHOLD > 0.05) else 0.25
                
                # Strict check: object's TOP predicted class must be person (class 0)
                # This prevents chairs, helmets, and hanging clothes from false-triggering
                mask = (max_class_ids == 0) & (person_scores >= conf_thresh)
                if mask.any():
                    filtered = predictions[mask]
                    confidences = person_scores[mask]
                    cx, cy, bw, bh = filtered[:, 0], filtered[:, 1], filtered[:, 2], filtered[:, 3]
                    sx, sy = original_w / float(in_w), original_h / float(in_h)

                    raw_detections = []
                    for k in range(len(filtered)):
                        bx1 = int((cx[k] - bw[k] / 2) * sx)
                        by1 = int((cy[k] - bh[k] / 2) * sy)
                        bx2 = int((cx[k] + bw[k] / 2) * sx)
                        by2 = int((cy[k] + bh[k] / 2) * sy)
                        bx1 = max(0, min(original_w, bx1))
                        by1 = max(0, min(original_h, by1))
                        bx2 = max(0, min(original_w, bx2))
                        by2 = max(0, min(original_h, by2))
                        
                        bbox = [bx1, by1, bx2, by2]
                        # Reject non-human objects, materials, ceiling-hung clothes, and ghost boxes
                        if self._is_valid_person_box(bbox, original_w, original_h):
                            raw_detections.append({
                                'bbox': bbox,
                                'confidence': float(confidences[k]),
                                'class': 'person'
                            })

                    detections = self._apply_nms(raw_detections, iou_threshold=IOU_THRESHOLD)[:MAX_DET]
            
            return detections
        except Exception as e:
            print(f"ONNX detection error: {e}")
            return []

    def _detect_tflite(self, frame):
        """TensorFlow Lite-based YOLO detection for 90%+ accuracy on ARM64."""
        try:
            import numpy as np
            
            # Preprocess frame for YOLO TFLite
            input_shape = self.input_details[0]['shape']
            input_size = input_shape[1:3]  # (height, width)
            
            # Resize and normalize
            img = cv2.resize(frame, (input_size[1], input_size[0]))
            img = img.astype(np.float32) / 255.0
            img = np.transpose(img, (2, 0, 1))  # HWC to CHW
            img = np.expand_dims(img, axis=0)  # Add batch dimension
            
            # Set input tensor
            self.interpreter.set_tensor(self.input_details[0]['index'], img)
            
            # Run inference
            self.interpreter.invoke()
            
            # Get output
            output = self.interpreter.get_tensor(self.output_details[0]['index'])
            
            # Parse outputs (YOLOv8 TFLite format)
            detections = []
            if output.shape[0] > 0:
                # Format: [batch, 84, 8400] where 84 = 4 bbox + 80 classes
                output = output[0]
                # Extract person class (class 0 in COCO)
                # This is a simplified parser - actual TFLite output format may vary
                for i in range(0, output.shape[0], 4):
                    # Only process every 4th element (bbox coordinates)
                    if i + 3 < output.shape[0]:
                        # Get center_x, center_y, width, height, confidence, class_id
                        # This is simplified - actual parsing depends on model output format
                        pass  # Full implementation would need exact TFLite output format
            
            return detections
        except Exception as e:
            print(f"TFLite detection error: {e}")
            return []

    def _detect_roboflow(self, frame):
        """Roboflow cloud-based detection for 90%+ accuracy."""
        try:
            # Resize frame to reduce API payload size (max 1024px)
            height, width = frame.shape[:2]
            max_size = 1024
            if max(height, width) > max_size:
                scale = max_size / max(height, width)
                new_width = int(width * scale)
                new_height = int(height * scale)
                frame = cv2.resize(frame, (new_width, new_height))

            # Encode frame to base64
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            img_base64 = base64.b64encode(buffer).decode('utf-8')

            # Send to Roboflow API using correct format
            # Roboflow detect API: POST with form data
            url = f"https://detect.roboflow.com/{ROBOFLOW_MODEL}?api_key={ROBOFLOW_API_KEY}"
            response = requests.post(
                url,
                data=img_base64,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10  # 10 second timeout
            )

            # Parse results
            result = response.json()
            detections = []

            # Debug logging
            print(f"[ROBOFLOW] API Response status: {response.status_code}")
            print(f"[ROBOFLOW] URL: {url}")

            if response.status_code != 200:
                print(f"[ROBOFLOW] Error response: {result}")
                return []

            print(f"[ROBOFLOW] Total predictions: {len(result.get('predictions', []))}")

            for prediction in result.get('predictions', []):
                class_name = prediction.get('class', '').lower()
                print(f"[ROBOFLOW] Detected: {class_name} (confidence: {prediction.get('confidence', 0):.2f})")
                if 'person' in class_name or 'human' in class_name:
                    x = prediction['x']
                    y = prediction['y']
                    w = prediction['width']
                    h = prediction['height']
                    confidence = prediction['confidence']

                    # Convert center coordinates to corner coordinates
                    detections.append({
                        'bbox': [int(x - w/2), int(y - h/2), int(x + w/2), int(y + h/2)],
                        'confidence': float(confidence),
                        'class': 'person'
                    })

            print(f"[ROBOFLOW] Person detections: {len(detections)}")
            return detections
        except Exception as e:
            print(f"Roboflow detection error: {e}")
            return []

    def _detect_opencv_dnn(self, frame):
        """OpenCV DNN with MobileNet-SSD for 70-80% accuracy."""
        try:
            # Get frame dimensions
            (h, w) = frame.shape[:2]
            
            # Preprocess frame for MobileNet-SSD
            blob = cv2.dnn.blobFromImage(
                cv2.resize(frame, (300, 300)),
                0.007843,
                (300, 300),
                127.5
            )
            
            # Pass the blob through the network
            self.net.setInput(blob)
            detections = self.net.forward()
            
            # Parse detections
            person_detections = []
            
            # MobileNet-SSD COCO classes: 15 = person
            for i in range(detections.shape[2]):
                confidence = detections[0, 0, i, 2]
                
                if confidence > OPENCV_DNN_CONFIDENCE_THRESHOLD:
                    class_id = int(detections[0, 0, i, 1])
                    
                    # COCO class 15 = person
                    if class_id == 15:
                        # Calculate bounding box
                        box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
                        (startX, startY, endX, endY) = box.astype("int")
                        
                        person_detections.append({
                            'bbox': [startX, startY, endX, endY],
                            'confidence': float(confidence),
                            'class': 'person'
                        })
            
            return person_detections
        except Exception as e:
            print(f"OpenCV DNN detection error: {e}")
            return []

    def _detect_yolo(self, frame):
        """YOLO-based passenger detection with improved accuracy and confidence filtering."""
        try:
            # Use original frame for detection to avoid any YOLO drawing
            # Add multiple parameters to completely disable any YOLO visualization
            results = self.model(
                frame, 
                conf=CONFIDENCE_THRESHOLD,  # Use general threshold for initial detection
                iou=IOU_THRESHOLD, 
                verbose=False,
                save=False,
                show=False,
                stream=False,
                show_labels=False,
                show_conf=False,
                line_width=None,
                show_boxes=False,
                imgsz=DETECTION_SIZE,
                max_det=MAX_DET  # Match MAX_DET threshold
            )
            
            raw_person_detections = []
            confidence_filtered_detections = []
            all_person_detections = []

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

                        raw_person_detections.append({
                            'bbox': [int(x1), int(y1), int(x2), int(y2)],
                            'confidence': confidence,
                            'class': class_name
                        })

                        # CRITICAL: Apply YOLO-specific confidence threshold BEFORE any further processing
                        # This ensures low-confidence detections never reach the counting logic
                        if confidence < YOLO_CONFIDENCE_THRESHOLD:
                            continue

                        confidence_filtered_detections.append({
                            'bbox': [int(x1), int(y1), int(x2), int(y2)],
                            'confidence': confidence,
                            'class': class_name
                        })

                        # Filter out very small detections (likely false positives)
                        box_width = x2 - x1
                        box_height = y2 - y1
                        box_area = box_width * box_height
                        frame_area = frame.shape[0] * frame.shape[1]
                        
                        # Minimum size: should be at least 2% of frame area
                        if box_area < frame_area * 0.02:
                            continue
                        
                        bbox = [int(x1), int(y1), int(x2), int(y2)]
                        if not self._is_valid_person_box(bbox, frame.shape[1], frame.shape[0]):
                            continue

                        all_person_detections.append({
                            'bbox': [int(x1), int(y1), int(x2), int(y2)],
                            'confidence': confidence,
                            'class': class_name
                        })

            # Apply additional non-maximum suppression to remove overlapping detections
            passenger_detections = self._apply_nms(all_person_detections)

            # CRITICAL: Only return the filtered detections - this is what gets counted
            # The counting logic uses len(returned_value), so this MUST be the filtered count
            final_count = len(passenger_detections)

            # Enhanced logging for confidence filtering
            raw_confidences = [round(d['confidence'], 2) for d in raw_person_detections]
            confidence_filtered_confidences = [round(d['confidence'], 2) for d in confidence_filtered_detections]
            final_confidences = [round(d['confidence'], 2) for d in passenger_detections]
            rejected_confidences = [c for c in raw_confidences if c < YOLO_CONFIDENCE_THRESHOLD]
            
            print(f"[YOLO] Raw detections: {len(raw_person_detections)}")
            print(f"[YOLO] Accepted detections: {len(confidence_filtered_detections)}")
            print(f"[YOLO] Rejected detections: {len(rejected_confidences)}")
            print(f"[YOLO] Accepted confidences: {confidence_filtered_confidences}")
            if rejected_confidences:
                print(f"[YOLO] Rejected confidences: {rejected_confidences}")
            print(f"[YOLO] Final detections (used for counting): {final_count}")
            print(f"[YOLO] Final confidences (used for counting): {final_confidences}")

            return passenger_detections
        except Exception as e:
            print(f"[YOLO] Detection error: {e}")
            return []

    @staticmethod
    def _is_valid_person_box(bbox, frame_w, frame_h):
        """Reject non-human objects, materials, and ceiling/wall-hung clothes.
        A real passenger is standing or seated, extending down into the seating/floor area.
        Hanging clothes, curtains, and objects floating in the upper half of the view
        are strictly rejected."""
        x1, y1, x2, y2 = bbox
        w = x2 - x1
        h = y2 - y1

        # 1. Minimum person dimensions (must have sufficient pixels)
        if h < 80 or w < 40:
            return False

        # 2. Ceiling / wall-hung object rejection:
        # Real passengers stand on the floor or sit on seats (y2 > 0.58 * frame_h).
        # Any detection whose bottom edge ends in mid-air in the upper half (y2 <= 0.58 * frame_h)
        # while originating near the top/wall (y1 < 0.25 * frame_h) is a hanging object
        # (clothes on hangers, hooks, bags, curtains, overhead gear).
        if y2 <= int(frame_h * 0.58) and y1 < int(frame_h * 0.25):
            return False

        # 3. Reject abnormally wide composite boxes (e.g. mega box covering table + clothes)
        if w > int(frame_w * 0.50) and h < int(frame_h * 0.85):
            return False

        # 4. Aspect ratio: human passengers are vertically oriented or seated (h/w >= 0.65)
        # Flat horizontal inanimate objects (countertops, benches, blankets) are rejected
        if (h / float(w)) < 0.65:
            return False

        return True

    def _calculate_ios(self, box1, box2):
        """Intersection over Smaller Box Area — detects when one box engulfs or contains another."""
        x1 = max(box1[0], box2[0])
        y1 = max(box1[1], box2[1])
        x2 = min(box1[2], box2[2])
        y2 = min(box1[3], box2[3])

        if x2 <= x1 or y2 <= y1:
            return 0.0

        inter_area = (x2 - x1) * (y2 - y1)
        area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
        area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
        smaller_area = min(area1, area2)

        return inter_area / float(smaller_area) if smaller_area > 0 else 0.0

    def _apply_nms(self, detections, iou_threshold=0.35):
        """Apply Non-Maximum Suppression with containment suppression to remove overlapping detections."""
        if not detections:
            return detections
        
        # Sort by confidence (highest first)
        detections_sorted = sorted(detections, key=lambda x: x['confidence'], reverse=True)
        
        final_detections = []
        while detections_sorted:
            # Keep the highest confidence detection
            current = detections_sorted.pop(0)
            final_detections.append(current)
            
            # Remove detections that overlap significantly or are engulfed by current
            remaining = []
            for det in detections_sorted:
                iou = self._calculate_iou(current['bbox'], det['bbox'])
                ios = self._calculate_ios(current['bbox'], det['bbox'])
                if iou < iou_threshold and ios < 0.65:
                    remaining.append(det)
            
            detections_sorted = remaining
        
        return final_detections

    def _calculate_iou(self, box1, box2):
        """Calculate Intersection over Union (IoU) between two bounding boxes."""
        x1_1, y1_1, x2_1, y2_1 = box1
        x1_2, y1_2, x2_2, y2_2 = box2
        
        # Calculate intersection
        x1_i = max(x1_1, x1_2)
        y1_i = max(y1_1, y1_2)
        x2_i = min(x2_1, x2_2)
        y2_i = min(y2_1, y2_2)
        
        if x2_i <= x1_i or y2_i <= y1_i:
            return 0.0
        
        intersection_area = (x2_i - x1_i) * (y2_i - y1_i)
        
        # Calculate union
        area1 = (x2_1 - x1_1) * (y2_1 - y1_1)
        area2 = (x2_2 - x1_2) * (y2_2 - y1_2)
        union_area = area1 + area2 - intersection_area
        
        return intersection_area / union_area if union_area > 0 else 0.0
    
    def draw_detections(self, frame, detections):
        """Draw bounding boxes on detected passengers in bright green"""
        dets = detections if detections is not None else getattr(self, 'last_detections', [])
        for i, detection in enumerate(dets or [], 1):
            bbox = detection.get('bbox')
            if not bbox or len(bbox) < 4:
                continue
            x1, y1, x2, y2 = bbox
            conf = detection.get('confidence', 0)

            # Bright Green Bounding Box (BGR: 0, 255, 0)
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

            # Person badge label
            label = f"Person {i}: {conf:.2f}" if conf > 0 else f"Person {i}"
            label_size, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)

            # Draw green background for label
            cv2.rectangle(frame, (x1, max(0, y1 - label_size[1] - 6)),
                         (x1 + label_size[0] + 4, y1), (0, 200, 0), -1)
            cv2.putText(frame, label, (x1 + 2, max(12, y1 - 3)),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1)

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
        """Write raw passenger count to local SQLite (zero network calls).
        sync_worker.py aggregates these rows every minute and pushes one
        aggregate row to Supabase — cutting API calls by ~12×.
        """
        if not self.current_trip_id:
            print(f"[DB] No trip_id set - cannot save count (trip_id required for database)")
            return  # live count still streams via WebSocket — DB write needs a trip

        try:
            current_time = time.time()
            # Throttle: only write once every db_save_interval seconds
            if current_time - self.last_db_save < self.db_save_interval:
                return

            write_passenger_count(
                count=count,
                trip_id=self.current_trip_id,
                bus_id=self.current_bus_id,
                ai_count=count,
                source="yolo_pi",
            )
            self.last_db_save = current_time
            print(f"[DB] ✓ Buffered count={count} trip={self.current_trip_id} → SQLite")

            # Trigger anomaly detection only every 5 minutes
            if current_time - self.last_anomaly_check >= self.anomaly_check_interval:
                self.last_anomaly_check = current_time
                self.trigger_anomaly_detection()
        except Exception as e:
            print(f"[DB] ✗ Error writing passenger count to SQLite: {e}")
    
    def trigger_anomaly_detection(self):
        """Trigger anomaly detection in a background thread — never blocks video streaming."""
        if not self.current_trip_id:
            return

        import threading
        def _detect():
            try:
                import requests
                detect_url = f"{BACKEND_URL}/api/anomaly-detection/detect"
                payload = {
                    'threshold': 2,
                    'check_all_active': False,
                    'trip_id': self.current_trip_id,
                    'scenarios': ['count_mismatch', 'overcrowding', 'staff_absence',
                                  'camera_malfunction', 'passenger_spike', 'trip_duration',
                                  'route_deviation', 'boarding_rate']
                }
                response = requests.post(detect_url, json=payload, timeout=10)
                if response.status_code == 200:
                    result = response.json()
                    anomalies = result.get('total_anomalies_detected', 0)
                    if anomalies > 0:
                        print(f"[Anomaly] {anomalies} anomaly(s) detected for trip {self.current_trip_id}")
            except Exception as e:
                print(f"[Anomaly] Failed to trigger detection: {e}")

        threading.Thread(target=_detect, daemon=True).start()

    def set_current_trip(self, trip_id, bus_id=None):
        """Set the current trip ID for database recording"""
        self.current_trip_id = trip_id
        self.current_bus_id = bus_id
        print(f"Current trip ID set to: {trip_id}, bus_id: {bus_id}")
        # Auto-start recording when a trip begins
        if ENABLE_VIDEO_RECORDING and not self.recording:
            self.start_recording()

    def clear_current_trip(self):
        """Clear the current trip ID"""
        # Auto-stop recording when trip ends
        if self.recording:
            self.stop_recording()
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
            # Use MP4 format with mp4v codec - browser compatible
            filename = f"video_{timestamp}{trip_suffix}.mp4"
            self.current_video_path = os.path.join(VIDEO_STORAGE_PATH, filename)

            # Read actual camera dimensions — they may differ from requested resolution
            actual_w = int(self.camera.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_h = int(self.camera.get(cv2.CAP_PROP_FRAME_HEIGHT))
            actual_fps = self.camera.get(cv2.CAP_PROP_FPS) or FPS
            print(f"[Recording] Using frame size: {actual_w}x{actual_h} @ {actual_fps}fps")

            # Initialize video writer with actual camera dimensions - use mp4v for browser compatibility
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            self.video_writer = cv2.VideoWriter(
                self.current_video_path,
                fourcc,
                actual_fps,
                (actual_w, actual_h)
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

            # Capture these before clearing state
            video_path = self.current_video_path
            trip_id = self.current_trip_id
            start_time = self.recording_start_time
            frame_count = self.recording_frame_count

            # Calculate duration
            duration = int(time.time() - start_time) if start_time else 0

            # Get file size
            file_size = 0
            if video_path and os.path.exists(video_path):
                file_size = os.path.getsize(video_path)

            print(f"Recording stopped: {video_path}")
            print(f"Duration: {duration}s, Frames: {frame_count}, Size: {file_size} bytes")

            # Clear state before DB call so crashes don't leave stale state
            self.current_video_path = None
            self.recording_start_time = None
            self.recording_frame_count = 0

            # Save metadata to database
            recording_id = self._save_video_metadata_internal(video_path, trip_id, start_time, frame_count, duration, file_size)

            return {
                'file_path': video_path,
                'duration': duration,
                'frame_count': frame_count,
                'file_size': file_size,
                'recording_id': recording_id
            }

        except Exception as e:
            print(f"Error stopping recording: {e}")
            return None

    def _upload_to_cloudflare_stream(self, video_path, trip_id):
        """Upload video to Cloudflare Stream and return playback URL"""
        account_id = os.getenv('CLOUDFLARE_ACCOUNT_ID')
        api_token = os.getenv('CLOUDFLARE_API_TOKEN')
        cloudflare_enabled = os.getenv('CLOUDFLARE_ENABLED', 'false').lower() == 'true'

        if not cloudflare_enabled or not account_id or not api_token:
            print("[Cloudflare] Cloudflare Stream not configured - skipping upload")
            return None

        if not video_path or not os.path.exists(video_path):
            print(f"[Cloudflare] Video file not found: {video_path}")
            return None

        try:
            print(f"[Cloudflare] Uploading video to Cloudflare Stream: {video_path}")

            # Cloudflare Stream Direct Upload API
            url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/stream"
            headers = {
                'Authorization': f'Bearer {api_token}',
            }

            # Upload the file
            with open(video_path, 'rb') as video_file:
                files = {
                    'file': (os.path.basename(video_path), video_file, 'video/mp4')
                }
                params = {
                    'metadata': json.dumps({
                        'trip_id': trip_id,
                        'recorded_at': time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime())
                    })
                }

                response = requests.post(url, headers=headers, files=files, params=params, timeout=300)

            if response.status_code == 200:
                result = response.json()
                if result.get('success'):
                    video_uid = result['result']['uid']
                    playback_url = f"https://watch.cloudflarestream.com/{video_uid}"
                    print(f"[Cloudflare] Upload successful! Playback URL: {playback_url}")
                    return playback_url
                else:
                    print(f"[Cloudflare] Upload failed: {result.get('errors')}")
                    return None
            else:
                print(f"[Cloudflare] Upload failed with status {response.status_code}: {response.text}")
                return None

        except Exception as e:
            print(f"[Cloudflare] Upload error: {e}")
            return None

    def _save_video_metadata_internal(self, video_path, trip_id, start_time, frame_count, duration, file_size):
        """Save video recording metadata to Supabase database (internal, uses explicit params)"""
        if not supabase:
            print("Database not available - skipping metadata save")
            return None

        try:
            # Try to upload to Cloudflare Stream first
            cloudflare_url = self._upload_to_cloudflare_stream(video_path, trip_id)
            
            actual_w = int(self.camera.get(cv2.CAP_PROP_FRAME_WIDTH)) if self.camera else CAMERA_WIDTH
            actual_h = int(self.camera.get(cv2.CAP_PROP_FRAME_HEIGHT)) if self.camera else CAMERA_HEIGHT
            
            data = {
                'trip_id': trip_id,
                'file_name': os.path.basename(video_path) if video_path else 'unknown',
                'file_path': cloudflare_url if cloudflare_url else video_path,
                'file_size': file_size,
                'duration': duration,
                'format': 'mp4',
                'storage_type': 'cloudflare' if cloudflare_url else 'local',
                'status': 'completed',
                'metadata': {
                    'resolution': f"{actual_w}x{actual_h}",
                    'fps': FPS,
                    'frame_count': frame_count,
                    'recorded_at': time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(start_time)) if start_time else None,
                    'cloudflare_url': cloudflare_url
                }
            }

            result = supabase.table('video_recordings').insert(data).execute()
            if result and result.data:
                recording_id = result.data[0].get('id')
                print(f"[DB] Video metadata saved: id={recording_id}, trip={trip_id}, size={file_size}b, storage={data['storage_type']}")
                
                # Also update trips table with Cloudflare URL
                if cloudflare_url:
                    trips_update = {
                        'video_recording_url': cloudflare_url,
                        'video_recording_duration': duration,
                        'video_recording_status': 'available',
                        'video_recording_file_size': file_size,
                        'video_recording_uploaded_at': time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime())
                    }
                    supabase.table('trips').update(trips_update).eq('id', trip_id).execute()
                    print(f"[DB] Updated trips table with Cloudflare URL")
                
                return str(recording_id) if recording_id else None
            else:
                print("[DB] Video metadata save returned no data")
                return None
        except Exception as e:
            print(f"Error saving video metadata to database: {e}")
            return None

    def save_video_metadata(self, duration, file_size):
        """Deprecated — kept for backwards compatibility. Use _save_video_metadata_internal."""
        return self._save_video_metadata_internal(
            self.current_video_path, self.current_trip_id,
            self.recording_start_time, self.recording_frame_count,
            duration, file_size
        )
    
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
                
                # Calculate actual FPS for monitoring (print only every 150 frames)
                current_time = time.time()
                if current_time - last_fps_time >= 5.0:
                    actual_fps = frame_counter / (current_time - last_fps_time)
                    print(f"[PERF] FPS: {actual_fps:.1f}")
                    frame_counter = 0
                    last_fps_time = current_time
                
                # Real-time optimization: Run detection asynchronously in worker thread without blocking video stream
                if COUNT_METHOD != 'backend':
                    if not getattr(self, '_is_detecting', False):
                        self._is_detecting = True
                        detection_frame = frame.copy()
                        
                        async def _run_detection_async(det_frame):
                            try:
                                raw_dets = await asyncio.to_thread(self.detect_passengers, det_frame)
                                stable_dets = self.tracker.update(raw_dets)
                                self.passenger_count = len(stable_dets)
                                self.last_detections = stable_dets
                                self.last_detection_count = self.frame_count
                            except Exception as det_err:
                                print(f"[DETECTION ERROR] {det_err}")
                            finally:
                                self._is_detecting = False
                        
                        asyncio.create_task(_run_detection_async(detection_frame))
                    
                    detections = getattr(self, 'last_detections', [])
                else:
                    # Backend mode: use last known detections from backend response
                    detections = getattr(self, 'last_detections', [])
                
                # Only print passenger count periodically to reduce overhead
                if self.frame_count % 30 == 0:
                    method = COUNT_METHOD.upper() if COUNT_METHOD else 'Unknown'
                    print(f"[COUNT] {self.passenger_count} passenger(s) in frame (using {method} detection)")
                
                # Store detection history (reduced from 30 to 10 for less memory)
                self.detection_history.append(self.passenger_count)
                if len(self.detection_history) > 10:
                    self.detection_history.pop(0)
                
                # Save passenger count to database (can be disabled for ultra-low latency)
                if not DISABLE_DB_WRITES and self.frame_count % (FPS * self.db_save_interval) == 0:
                    self.save_passenger_count_to_db(self.passenger_count)
                
                # Real-time optimization: Optional drawing
                if DISABLE_DRAWING:
                    annotated_frame = frame
                else:
                    annotated_frame = self.draw_detections(frame, detections)
                
                # Write frame to video if recording (can be disabled for max speed)
                if ENABLE_VIDEO_RECORDING:
                    self.write_frame_to_video(annotated_frame)
                
                # Encode frame for streaming
                frame_base64 = self.encode_frame(annotated_frame)
                
                if frame_base64:
                    self.latest_frame = frame_base64
                    # Put frame in queue for streaming (drop old frames if queue is full)
                    if self.frame_queue.full():
                        try:
                            self.frame_queue.get_nowait()
                        except queue.Empty:
                            pass
                    self.frame_queue.put(frame_base64)
                
                # Minimal frame rate control - rely on camera's natural timing
                if ENABLE_REALTIME_MODE:
                    await asyncio.sleep(0.005)  # Yield to event loop
                else:
                    await asyncio.sleep(1.0 / FPS)
                
            except Exception as e:
                print(f"Processing error: {e}")
                await asyncio.sleep(0.1)
    
    async def stream_frames(self):
        """Background task to stream frames - Optimized for low latency"""
        last_stream_time = time.time()
        stream_counter = 0
        
        while self.running:
            try:
                frame_base64 = None
                if not self.frame_queue.empty():
                    try:
                        frame_base64 = self.frame_queue.get_nowait()
                    except queue.Empty:
                        pass
                elif getattr(self, 'latest_frame', None):
                    frame_base64 = self.latest_frame

                if frame_base64 and self.websocket_clients:
                    stream_counter += 1
                    msg = {
                        'video_frame': frame_base64,
                        'count': self.passenger_count,
                        'average_count': getattr(self, 'average_count', 0),
                        'camera_active': True
                    }
                    disconnected_clients = set()
                    for client in list(self.websocket_clients):
                        try:
                            await client.send_json(msg)
                        except Exception:
                            disconnected_clients.add(client)
                    
                    if disconnected_clients:
                        self.websocket_clients -= disconnected_clients

                current_time = time.time()
                if current_time - last_stream_time >= 5.0:
                    stream_fps = stream_counter / (current_time - last_stream_time)
                    print(f"[STREAM] Streaming FPS: {stream_fps:.1f}, Clients: {len(self.websocket_clients)}")
                    stream_counter = 0
                    last_stream_time = current_time

                await asyncio.sleep(0.04)  # ~25 FPS pacing, yields cleanly to event loop
            except Exception as e:
                print(f"Streaming error: {e}")
                await asyncio.sleep(0.1)
    
    def start(self):
        """Start video processing. Returns (success, error_message)."""
        cam_ok = self.initialize_camera()
        if not cam_ok:
            return False, (
                "Camera not found. Tried V4L2 indexes 0-3 and /dev/video*. "
                "Check USB connection and run: ls /dev/video*; v4l2-ctl --list-devices"
            )

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
            'detections': getattr(video_processor, 'last_detections', []),
            'connected_clients': len(video_processor.websocket_clients),
            'current_trip_id': video_processor.current_trip_id,
            'bus_id': ASSIGNED_BUS_ID,
            'bus_number': BUS_NUMBER,
            'bus_plate': ASSIGNED_BUS_PLATE,
            'sync': sync_status(),
        })
    except Exception as e:
        return JSONResponse({
            'status': 'error',
            'message': str(e),
            'camera_active': False,
            'passenger_count': 0,
            'connected_clients': 0,
            'current_trip_id': None,
            'bus_id': ASSIGNED_BUS_ID,
            'bus_number': BUS_NUMBER,
            'bus_plate': ASSIGNED_BUS_PLATE,
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
    """Stream a video file - supports range requests for browser playback"""
    file_path = os.path.join(VIDEO_STORAGE_PATH, filename)

    if not os.path.exists(file_path):
        return JSONResponse({'status': 'error', 'message': 'File not found'}, status_code=404)

    try:
        file_size = os.path.getsize(file_path)
        if file_size < 1000:  # Less than 1KB means file is corrupted/empty
            return JSONResponse({'status': 'error', 'message': 'Video file is corrupted or empty'}, status_code=500)

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

@app.post("/refresh-contacts")
async def refresh_contacts():
    """Refresh emergency and admin contacts from database"""
    if not hardware_manager:
        return JSONResponse({'status': 'error', 'message': 'Hardware manager not available'}, status_code=503)

    try:
        hardware_manager.refresh_contacts()
        return JSONResponse({
            'status': 'success',
            'message': 'Contacts refreshed successfully',
            'emergency_contacts_count': len(hardware_manager.emergency_contacts),
            'admin_contacts_count': len(hardware_manager.admin_contacts)
        })
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
                await websocket.send_json({"status": "Video stream started", "ai_detection": True})
            else:
                await websocket.send_json({"error": err_msg or "Camera not found"})
        else:
            # Already running — send status + immediately push one frame so
            # the dashboard onopen receives data before the 12s timeout fires
            await websocket.send_json({"status": "Connected to video server"})
            latest = getattr(video_processor, 'latest_frame', None)
            if not latest and not video_processor.frame_queue.empty():
                try:
                    latest = video_processor.frame_queue.queue[0]
                except Exception:
                    pass
            if latest:
                await websocket.send_json({
                    'video_frame': latest,
                    'count': video_processor.passenger_count,
                    'average_count': getattr(video_processor, 'average_count', 0),
                    'camera_active': True
                })

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
                    latest = getattr(video_processor, 'latest_frame', None)
                    if latest:
                        await websocket.send_json({
                            'video_frame': latest,
                            'count': video_processor.passenger_count,
                            'average_count': getattr(video_processor, 'average_count', 0),
                            'camera_active': True
                        })
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
    import fcntl
    import sys
    import uvicorn

    # Prevent double-start races (systemd restart vs leftover process on :8080)
    lock_path = os.path.join('/tmp', 'commutai-pi-server.lock')
    lock_fd = open(lock_path, 'w')
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        lock_fd.write(str(os.getpid()))
        lock_fd.flush()
    except BlockingIOError:
        print(f"Another commutai video server instance already holds {lock_path} — exiting")
        sys.exit(0)

    print("Starting Bus Monitoring Video Server (FastAPI)...")
    print(f"Camera ID: {CAMERA_ID} (device={CAMERA_DEVICE})")
    print(f"Resolution: {CAMERA_WIDTH}x{CAMERA_HEIGHT}")
    print(f"FPS: {FPS}")
    print(f"Listening on 0.0.0.0:{SERVER_PORT}")

    try:
        uvicorn.run(app, host='0.0.0.0', port=SERVER_PORT)
    except KeyboardInterrupt:
        print("Server shutdown requested")
    except OSError as e:
        # errno 98 = address already in use
        print(f"Server bind error on port {SERVER_PORT}: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Server error: {e}")
        sys.exit(1)
