#!/usr/bin/env python3
"""
Raspberry Pi Video Server - Stream Only Mode
Captures video from camera and streams raw frames to backend for processing
No local AI processing - backend handles detection with higher accuracy
"""

import cv2
import base64
import json
import time
import asyncio
import websockets
import os
from dotenv import load_dotenv
from hardware_integration import HardwareManager
from supabase import create_client, Client

load_dotenv()

# Backend configuration
BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:8000')
BACKEND_WS_URL = BACKEND_URL.replace('http', 'ws')

# Camera configuration
CAMERA_DEVICE = os.getenv('CAMERA_DEVICE', '/dev/video0')
CAMERA_WIDTH = int(os.getenv('CAMERA_WIDTH', '640'))
CAMERA_HEIGHT = int(os.getenv('CAMERA_HEIGHT', '480'))
FPS = int(os.getenv('FPS', '10'))
JPEG_QUALITY = int(os.getenv('JPEG_QUALITY', '60'))

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
supabase: Client = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("Supabase client initialized")
    except Exception as e:
        print(f"Failed to initialize Supabase: {e}")

# Bus assignment
BUS_NUMBER = int(os.getenv("BUS_NUMBER", "1"))
ASSIGNED_BUS_ID: str = None
ASSIGNED_BUS_PLATE: str = None

def resolve_assigned_bus():
    """Look up the bus record for BUS_NUMBER"""
    global ASSIGNED_BUS_ID, ASSIGNED_BUS_PLATE
    if not supabase:
        return
    try:
        result = supabase.table("buses").select("id, plate_number").eq("bus_number", BUS_NUMBER).single().execute()
        if result.data:
            ASSIGNED_BUS_ID = result.data["id"]
            ASSIGNED_BUS_PLATE = result.data["plate_number"]
            print(f"[Bus] Assigned to bus_number={BUS_NUMBER} | id={ASSIGNED_BUS_ID} | plate={ASSIGNED_BUS_PLATE}")
    except Exception as e:
        print(f"[Bus] Failed to resolve bus assignment: {e}")

def register_device():
    """Register this Pi's IP in Supabase"""
    if not supabase:
        return
    try:
        import socket
        hostname = socket.gethostname()
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            lan_ip = s.getsockname()[0]
        finally:
            s.close()

        server_port = int(os.getenv("PORT", "5000"))

        supabase.table("pi_devices").upsert({
            "bus_number": BUS_NUMBER,
            "bus_id": ASSIGNED_BUS_ID,
            "ip_address": lan_ip,
            "port": server_port,
            "last_seen": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            "hostname": hostname,
        }, on_conflict="bus_number").execute()

        print(f"[Device] Registered: bus={BUS_NUMBER} ip={lan_ip}:{server_port}")
    except Exception as e:
        print(f"[Device] Failed to register: {e}")

# Hardware Manager configuration
HARDWARE_CONFIG = {
    'enable_sms': os.getenv('ENABLE_SMS', 'false').lower() == 'true',
    'enable_gps': os.getenv('ENABLE_GPS', 'false').lower() == 'true',
    'enable_emergency_button': os.getenv('ENABLE_EMERGENCY_BUTTON', 'false').lower() == 'true',
    'enable_geolocation': os.getenv('ENABLE_GEOLOCATION', 'true').lower() == 'true',
    'sim900a_port': os.getenv('SIM900A_PORT', '/dev/ttyS0'),
    'sim900a_baudrate': int(os.getenv('SIM900A_BAUDRATE', '9600')),
    'neo6m_port': os.getenv('NEO6M_PORT', '/dev/serial0'),
    'neo6m_baudrate': int(os.getenv('NEO6M_BAUDRATE', '9600')),
    'emergency_button_pin': int(os.getenv('EMERGENCY_BUTTON_PIN', '18')),
    'osm_user_agent': os.getenv('OSM_USER_AGENT', 'BusMonitoringSystem'),
    'emergency_contacts': os.getenv('EMERGENCY_CONTACTS', '').split(',') if os.getenv('EMERGENCY_CONTACTS') else [],
    'admin_contacts': os.getenv('ADMIN_CONTACTS', '').split(',') if os.getenv('ADMIN_CONTACTS') else []
}

hardware_manager = None
try:
    hardware_manager = HardwareManager(HARDWARE_CONFIG, db_client=supabase)
    if hardware_manager.initialize():
        print("Hardware manager initialized")
        hardware_manager.start_gps_tracking()
except Exception as e:
    print(f"Hardware manager initialization error: {e}")

resolve_assigned_bus()
register_device()

print(f"[Stream Mode] Backend URL: {BACKEND_URL}")
print(f"[Stream Mode] Camera: {CAMERA_WIDTH}x{CAMERA_HEIGHT} @ {FPS}fps")


class VideoStreamer:
    def __init__(self):
        self.camera = None
        self.running = False
        self.websocket = None
        self.current_trip_id = None
        self.last_passenger_count = 0
        self.last_detection_time = 0

    def initialize_camera(self):
        """Initialize the camera"""
        try:
            if self.camera is not None:
                self.camera.release()

            self.camera = cv2.VideoCapture(CAMERA_DEVICE)

            if not self.camera.isOpened():
                print(f"Error: Could not open camera at {CAMERA_DEVICE}")
                return False

            # Force MJPG format
            self.camera.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
            self.camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
            self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
            self.camera.set(cv2.CAP_PROP_FPS, FPS)
            self.camera.set(cv2.CAP_PROP_AUTOFOCUS, 0)

            # Test read
            for _ in range(3):
                ret, test_frame = self.camera.read()
            if not ret or test_frame is None:
                print("Error: Could not read test frame")
                self.camera.release()
                return False

            actual_width = int(self.camera.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_height = int(self.camera.get(cv2.CAP_PROP_FRAME_HEIGHT))
            actual_fps = int(self.camera.get(cv2.CAP_PROP_FPS))

            print(f"Camera initialized: {actual_width}x{actual_height} @ {actual_fps}fps")
            return True
        except Exception as e:
            print(f"Camera initialization error: {e}")
            return False

    def encode_frame(self, frame):
        """Encode frame to base64"""
        try:
            encode_params = [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY]
            _, buffer = cv2.imencode('.jpg', frame, encode_params)
            frame_base64 = base64.b64encode(buffer).decode('utf-8')
            return frame_base64
        except Exception as e:
            print(f"Frame encoding error: {e}")
            return None

    async def connect_to_backend(self):
        """Connect to backend WebSocket"""
        try:
            uri = f"{BACKEND_WS_URL}/ws/video-stream/pi-{BUS_NUMBER}"
            print(f"Connecting to backend: {uri}")
            self.websocket = await websockets.connect(uri)
            print("Connected to backend successfully")
            return True
        except Exception as e:
            print(f"Failed to connect to backend: {e}")
            return False

    async def stream_frames(self):
        """Stream frames to backend"""
        if not self.initialize_camera():
            print("Failed to initialize camera")
            return

        if not await self.connect_to_backend():
            print("Failed to connect to backend")
            return

        self.running = True
        print("Starting video stream...")

        try:
            while self.running:
                ret, frame = self.camera.read()
                if not ret:
                    print("Error reading frame")
                    break

                # Encode frame
                frame_data = self.encode_frame(frame)
                if not frame_data:
                    continue

                # Send frame to backend
                message = {
                    'type': 'frame',
                    'frame': frame_data,
                    'timestamp': time.time(),
                    'bus_number': BUS_NUMBER
                }

                try:
                    await self.websocket.send(json.dumps(message))

                    # Receive detection result
                    response = await asyncio.wait_for(self.websocket.recv(), timeout=2.0)
                    result = json.loads(response)

                    if result.get('type') == 'detection':
                        count = result.get('count', 0)
                        detections = result.get('detections', [])

                        if count != self.last_passenger_count:
                            print(f"[Detection] Passengers: {count}")
                            self.last_passenger_count = count
                            self.last_detection_time = time.time()

                except asyncio.TimeoutError:
                    print("Timeout waiting for detection result")
                except Exception as e:
                    print(f"Error in WebSocket communication: {e}")
                    # Try to reconnect
                    if not await self.connect_to_backend():
                        break

                # Control frame rate
                await asyncio.sleep(1.0 / FPS)

        except Exception as e:
            print(f"Streaming error: {e}")
        finally:
            self.stop()

    def set_current_trip(self, trip_id):
        """Set current trip ID"""
        self.current_trip_id = trip_id
        print(f"Current trip ID set to: {trip_id}")

    def clear_current_trip(self):
        """Clear current trip ID"""
        self.current_trip_id = None
        print("Current trip ID cleared")

    def stop(self):
        """Stop streaming"""
        self.running = False
        if self.camera:
            self.camera.release()
        if self.websocket:
            asyncio.create_task(self.websocket.close())
        print("Video stream stopped")


async def main():
    """Main entry point"""
    streamer = VideoStreamer()

    try:
        await streamer.stream_frames()
    except KeyboardInterrupt:
        print("\nShutting down...")
        streamer.stop()


if __name__ == "__main__":
    asyncio.run(main())
