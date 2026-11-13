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
import socket
import subprocess
import httpx
from dotenv import load_dotenv
from hardware_integration import HardwareManager
from supabase import create_client, Client

# SQLite local storage for offline resilience
try:
    from local_store import init_db, write_passenger_count, write_gps
    from sync_worker import start_sync_worker, stop_sync_worker, sync_status
    _SQLITE_AVAILABLE = True
except ImportError:
    _SQLITE_AVAILABLE = False
    print("[Warning] SQLite local store not available - data will not be buffered offline")

load_dotenv('.env.stream-mode')

def discover_backend_ip():
    """
    Auto-discover Windows backend IP address on the local network
    Returns the backend URL if found, None otherwise
    """
    # Check if BACKEND_URL is manually set in .env
    manual_backend = os.getenv('BACKEND_URL')
    if manual_backend and manual_backend != 'http://localhost:8000':
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
        print(f"[Discovery] Error during discovery: {e}")
        return None

# Backend configuration - auto-discover or use manual setting
BACKEND_URL = discover_backend_ip() or os.getenv('BACKEND_URL', 'http://localhost:8000')
# Handle both HTTP and HTTPS protocols correctly for WebSocket
BACKEND_WS_URL = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://')

# Camera configuration - Optimized for 30-60 FPS
# Use integer index for V4L2 compatibility (0 = /dev/video0, 1 = /dev/video1, etc.)
CAMERA_DEVICE_STR = os.getenv('CAMERA_DEVICE', '/dev/video0')
CAMERA_INDEX = int(os.getenv('CAMERA_INDEX', '0'))  # Use integer index for V4L2
CAMERA_WIDTH = int(os.getenv('CAMERA_WIDTH', '640'))
CAMERA_HEIGHT = int(os.getenv('CAMERA_HEIGHT', '480'))
FPS = int(os.getenv('FPS', '30'))  # 30 FPS
JPEG_QUALITY = int(os.getenv('JPEG_QUALITY', '25'))  # Very low quality for speed

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
    # Contacts are now fetched from database, these are only fallbacks
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

# Global variable to track current trip ID
current_trip_id = None


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

            # Open camera with V4L2 backend (same as working video_server_fastapi.py)
            self.camera = cv2.VideoCapture(CAMERA_INDEX, cv2.CAP_V4L2)

            if not self.camera.isOpened():
                print(f"❌ CAMERA ERROR: Could not open camera at index {CAMERA_INDEX} (/dev/video{CAMERA_INDEX})")
                self._list_available_cameras()
                print(f"   Troubleshooting steps:")
                print(f"   1. Check if camera is connected to Raspberry Pi")
                print(f"   2. Run: ls -la /dev/video* to list available camera devices")
                print(f"   3. Try: sudo modprobe bcm2835-v4l2")
                print(f"   4. Enable camera: sudo raspi-config → Interface Options → Camera")
                print(f"   5. Check camera cable connection")
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
                print("❌ CAMERA ERROR: Could not read test frame")
                print(f"   Camera may be in use by another process")
                print(f"   Try: sudo pkill -f python3 to stop other camera processes")
                print(f"   Or: sudo libcamera-hello to test camera directly")
                self.camera.release()
                return False

            actual_width = int(self.camera.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_height = int(self.camera.get(cv2.CAP_PROP_FRAME_HEIGHT))
            actual_fps = int(self.camera.get(cv2.CAP_PROP_FPS))

            print(f"✅ Camera initialized: {actual_width}x{actual_height} @ {actual_fps}fps")
            return True
        except Exception as e:
            print(f"❌ CAMERA ERROR: Initialization failed - {e}")
            print(f"   Check if camera is properly connected and permissions are correct")
            return False

    def _list_available_cameras(self):
        """List available camera devices using integer indices"""
        print("Attempting to find available cameras...")
        for i in range(4):
            try:
                test_cam = cv2.VideoCapture(i)
                if test_cam.isOpened():
                    ret, frame = test_cam.read()
                    if ret and frame is not None:
                        print(f"Found working camera at index {i} (/dev/video{i})")
                    test_cam.release()
            except Exception as e:
                print(f"Error checking index {i}: {e}")

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

    async def receive_detections(self):
        """Receive detection results in background without blocking"""
        while self.running:
            try:
                response = await self.websocket.recv()
                result = json.loads(response)

                if result.get('type') == 'detection':
                    count = result.get('count', 0)
                    detections = result.get('detections', [])

                    if count != self.last_passenger_count:
                        print(f"[Detection] Passengers: {count}")
                        self.last_passenger_count = count
                        self.last_detection_time = time.time()

                        # NOTE: Backend handles passenger count saving to Supabase
                        # Pi only streams frames - no local buffering needed
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Error receiving detection: {e}")
                break

    async def stream_frames(self):
        """Stream frames to backend - non-blocking for maximum FPS"""
        if not self.initialize_camera():
            # Try other camera indices before giving up
            print("Attempting to find alternative camera device...")
            camera_found = False
            for idx in range(4):
                if idx == CAMERA_INDEX:
                    continue
                try:
                    test_cam = cv2.VideoCapture(idx)
                    if test_cam.isOpened():
                        ret, _ = test_cam.read()
                        if ret:
                            print(f"Camera found at index {idx} (configured {CAMERA_INDEX} failed)")
                            test_cam.release()
                            # Try to initialize with this index
                            self.camera = cv2.VideoCapture(idx)
                            if self.camera.isOpened():
                                # Apply settings
                                self.camera.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
                                self.camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                                self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
                                self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
                                self.camera.set(cv2.CAP_PROP_FPS, FPS)
                                self.camera.set(cv2.CAP_PROP_AUTOFOCUS, 0)

                                # Test read
                                for _ in range(3):
                                    ret, test_frame = self.camera.read()
                                if ret and test_frame is not None:
                                    print(f"✅ Camera initialized at index {idx}")
                                    camera_found = True
                                    break
                                else:
                                    self.camera.release()
                        else:
                            test_cam.release()
                except Exception as e:
                    print(f"Error checking index {idx}: {e}")
                    continue

            if not camera_found:
                print("Failed to initialize camera after trying all devices")
                return

        if not await self.connect_to_backend():
            print("Failed to connect to backend")
            return

        self.running = True
        print("Starting video stream...")

        # Create a task to receive detection results independently
        receive_task = asyncio.create_task(self.receive_detections())

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

                # Get current GPS location if available
                gps_data = None
                if hardware_manager and hardware_manager.current_location:
                    loc = hardware_manager.current_location
                    gps_data = {
                        'latitude': loc.latitude,
                        'longitude': loc.longitude,
                        'altitude': loc.altitude,
                        'speed': loc.speed,
                        'accuracy': loc.accuracy,
                        'source': loc.source
                    }

                # Send frame to backend immediately (don't wait for response)
                message = {
                    'type': 'frame',
                    'frame': frame_data,
                    'timestamp': time.time(),
                    'bus_number': BUS_NUMBER,
                    'trip_id': self.current_trip_id,
                    'gps': gps_data
                }

                try:
                    await self.websocket.send(json.dumps(message))
                except Exception as e:
                    print(f"Error sending frame: {e}")
                    # Try to reconnect
                    if not await self.connect_to_backend():
                        break
                    receive_task = asyncio.create_task(self.receive_detections())

                # Control frame rate
                await asyncio.sleep(1.0 / FPS)

        except Exception as e:
            print(f"Streaming error: {e}")
        finally:
            self.running = False
            if receive_task:
                receive_task.cancel()
            self.stop()

    def set_current_trip(self, trip_id):
        """Set current trip ID"""
        self.current_trip_id = trip_id
        global current_trip_id
        current_trip_id = trip_id
        print(f"Current trip ID set to: {trip_id}")

    def clear_current_trip(self):
        """Clear current trip ID"""
        self.current_trip_id = None
        global current_trip_id
        current_trip_id = None
        print("Current trip ID cleared")

    def stop(self):
        """Stop streaming"""
        self.running = False
        if self.camera:
            self.camera.release()
        if self.websocket:
            asyncio.create_task(self.websocket.close())
        print("Video stream stopped")

    async def stream_with_reconnection(self):
        """Stream frames with automatic reconnection"""
        retry_count = 0
        max_retries = 5
        base_delay = 2  # seconds
        
        while retry_count < max_retries:
            try:
                await self.stream_frames()
                # If we get here, streaming ended normally
                break
            except Exception as e:
                retry_count += 1
                delay = min(base_delay * (2 ** retry_count), 60)  # Exponential backoff, max 60s
                print(f"[Video Streamer] Connection lost: {e}")
                print(f"[Video Streamer] Retry {retry_count}/{max_retries} in {delay}s...")
                await asyncio.sleep(delay)
                
                # Try to rediscover backend if connection fails
                global BACKEND_URL, BACKEND_WS_URL
                discovered = discover_backend_ip()
                if discovered:
                    BACKEND_URL = discovered
                    BACKEND_WS_URL = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://')
                    print(f"[Video Streamer] Rediscovered backend: {BACKEND_URL}")
        
        if retry_count >= max_retries:
            print(f"[Video Streamer] Failed after {max_retries} retries")


async def send_gps_to_backend():
    """Send GPS data to backend independently of video stream"""
    if not hardware_manager:
        print("Hardware manager not available, GPS upload disabled")
        return

    backend_ws_url = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws/video-stream/pi-' + str(BUS_NUMBER)

    while True:
        try:
            if hardware_manager.current_location:
                loc = hardware_manager.current_location
                gps_data = {
                    'latitude': loc.latitude,
                    'longitude': loc.longitude,
                    'altitude': loc.altitude,
                    'speed': loc.speed,
                    'accuracy': loc.accuracy,
                    'source': loc.source
                }

                message = {
                    'type': 'gps_update',
                    'gps': gps_data,
                    'bus_number': BUS_NUMBER,
                    'trip_id': current_trip_id,
                    'timestamp': time.time()
                }

                async with websockets.connect(backend_ws_url) as ws:
                    await ws.send(json.dumps(message))
                    print(f"[GPS Upload] Sent GPS: {loc.latitude:.6f}, {loc.longitude:.6f}")

                # Also store locally in SQLite for offline resilience
                if _SQLITE_AVAILABLE:
                    write_gps(
                        latitude=loc.latitude,
                        longitude=loc.longitude,
                        altitude=loc.altitude,
                        speed=loc.speed,
                        accuracy=loc.accuracy,
                        source=loc.source,
                        trip_id=current_trip_id
                    )
            else:
                print("[GPS Upload] No GPS location available yet")

        except Exception as e:
            print(f"[GPS Upload] Error: {e}")

        # Send GPS every 5 seconds
        await asyncio.sleep(5)


async def start_cloudflare_tunnel():
    """Start Cloudflare tunnel and return the URL"""
    import subprocess
    import shutil
    import re

    # Check if cloudflared is installed
    if not shutil.which('cloudflared'):
        print("[Cloudflare] cloudflared not found, installing...")
        arch = os.uname().machine
        if arch == 'aarch64':
            cf_arch = 'arm64'
        elif arch == 'armv7l':
            cf_arch = 'arm'
        else:
            print(f"[Cloudflare] Unsupported architecture: {arch}")
            return None

        try:
            subprocess.run([
                'curl', '-fsSL',
                f'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{cf_arch}',
                '-o', '/tmp/cloudflared'
            ], check=True)
            subprocess.run(['chmod', '+x', '/tmp/cloudflared'], check=True)
            subprocess.run(['sudo', 'mv', '/tmp/cloudflared', '/usr/local/bin/cloudflared'], check=True)
            print("[Cloudflare] cloudflared installed successfully")
        except subprocess.CalledProcessError as e:
            print(f"[Cloudflare] Failed to install cloudflared: {e}")
            return None

    # Check if tunnel is already running via systemd
    try:
        result = subprocess.run(['systemctl', 'is-active', 'cloudflared-tunnel'], capture_output=True, text=True)
        if result.returncode == 0:
            print("[Cloudflare] Tunnel already running via systemd, fetching URL...")
            result = subprocess.run([
                'sudo', 'journalctl', '-u', 'cloudflared-tunnel', '-n', '50', '--no-pager'
            ], capture_output=True, text=True)
            match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', result.stdout)
            if match:
                url = match.group(0)
                print(f"[Cloudflare] Existing tunnel URL: {url}")
                return url
    except Exception as e:
        print(f"[Cloudflare] Error checking systemd tunnel: {e}")

    # Start tunnel in background if not running
    print("[Cloudflare] Starting tunnel...")
    try:
        process = subprocess.Popen(
            ['cloudflared', 'tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:8080'],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True
        )

        # Wait for URL in output
        for _ in range(45):
            line = process.stdout.readline()
            if 'trycloudflare.com' in line:
                match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line)
                if match:
                    url = match.group(0)
                    print(f"[Cloudflare] Tunnel started: {url}")
                    return url
            await asyncio.sleep(1)

        print("[Cloudflare] Tunnel started but URL not found")
        return None
    except Exception as e:
        print(f"[Cloudflare] Failed to start tunnel: {e}")
        return None


async def main():
    """Main entry point"""
    gps_task = None
    try:
        # Initialize SQLite local storage for offline resilience
        if _SQLITE_AVAILABLE:
            init_db()
            start_sync_worker()
            print("[Stream Mode] SQLite local storage initialized")

        # Start Cloudflare tunnel for local access (optional)
        tunnel_url = await start_cloudflare_tunnel()
        if tunnel_url:
            print(f"[Cloudflare] Tunnel URL available: {tunnel_url}")

        # Start GPS upload task independently
        gps_task = asyncio.create_task(send_gps_to_backend())

        # Keep the Pi camera service alive independently of backend restarts or
        # temporary network loss. stream_with_reconnection() handles retries with
        # exponential backoff and rediscovery.
        while True:
            streamer = VideoStreamer()
            await streamer.stream_with_reconnection()
            print("[Stream Mode] Max retries reached; restarting in 10 seconds")
            await asyncio.sleep(10)
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        # Stop sync worker
        if _SQLITE_AVAILABLE:
            stop_sync_worker()
            print("[Stream Mode] SQLite sync worker stopped")

        if gps_task:
            gps_task.cancel()
            try:
                await gps_task
            except asyncio.CancelledError:
                pass


if __name__ == "__main__":
    asyncio.run(main())
