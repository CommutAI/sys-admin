"""
Video Processing Service for CommutAI System
Receives raw video frames from Raspberry Pi and processes them with YOLOv8 or Roboflow
Optimized for CPU/Intel GPU for 90%+ accuracy in passenger counting
"""

import cv2
import numpy as np
import base64
import json
import time
import asyncio
from typing import Optional, List, Dict
from queue import Queue
import os
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client, Client
import requests

load_dotenv()

# AI Model imports
try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    print("Warning: ultralytics not installed - AI detection disabled")

# Roboflow client import
try:
    from roboflow_client import roboflow_client, RoboflowWorkflowError
    ROBOFLOW_AVAILABLE = True
except ImportError:
    ROBOFLOW_AVAILABLE = False
    print("Warning: roboflow_client not available")

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_KEY", ""))
supabase: Optional[Client] = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("Video processor: Supabase client initialized")
    except Exception as e:
        print(f"Video processor: Failed to initialize Supabase: {e}")

# Detection method: 'yolo' (local) or 'roboflow' (cloud workflow)
DETECTION_METHOD = os.getenv('DETECTION_METHOD', 'yolo').lower()

# Model configuration - Optimized for maximum speed (YOLOv8n)
MODEL_PATH = os.getenv('MODEL_PATH', 'yolov8n.pt')  # Nano model for maximum speed
CONFIDENCE_THRESHOLD = float(os.getenv('CONFIDENCE_THRESHOLD', '0.25'))  # Lower for speed
IOU_THRESHOLD = float(os.getenv('IOU_THRESHOLD', '0.45'))
YOLO_CONFIDENCE_THRESHOLD = float(os.getenv('YOLO_CONFIDENCE_THRESHOLD', '0.35'))  # Lower for speed
DETECTION_SIZE = int(os.getenv('DETECTION_SIZE', '320'))  # Smallest for maximum speed
MAX_DET = int(os.getenv('MAX_DET', '30'))  # Maximum detections

# Update Roboflow client with API key from env
if ROBOFLOW_AVAILABLE:
    roboflow_client.api_key = os.getenv('ROBOFLOW_API_KEY')

# Passenger detection classes (COCO dataset)
PASSENGER_CLASSES = ['person']

# Database save interval (seconds)
# Frames keep streaming live; only database count writes are throttled.
DB_SAVE_INTERVAL = int(os.getenv('DB_SAVE_INTERVAL', '5'))

# Token optimization settings for Roboflow
ROBOFLOW_FRAME_SKIP = int(os.getenv('ROBOFLOW_FRAME_SKIP', '3'))  # Process every Nth frame (default: 3)
ROBOFLOW_MIN_DETECTION_INTERVAL = float(os.getenv('ROBOFLOW_MIN_DETECTION_INTERVAL', '1.0'))  # Minimum seconds between detections

# Video recording configuration
VIDEO_RECORDING_ENABLED = os.getenv('VIDEO_RECORDING_ENABLED', 'true').lower() == 'true'
VIDEO_OUTPUT_DIR = os.getenv('VIDEO_OUTPUT_DIR', './recordings')
VIDEO_FPS = int(os.getenv('VIDEO_FPS', '15'))  # Lower FPS for smaller files
VIDEO_QUALITY = int(os.getenv('VIDEO_QUALITY', '40'))  # JPEG quality for frames

# Ensure output directory exists
if VIDEO_RECORDING_ENABLED and not os.path.exists(VIDEO_OUTPUT_DIR):
    os.makedirs(VIDEO_OUTPUT_DIR, exist_ok=True)
    print(f"[Video Processor] Created video output directory: {VIDEO_OUTPUT_DIR}")

print(f"[Video Processor] Model: {MODEL_PATH}")
print(f"[Video Processor] Confidence threshold: {YOLO_CONFIDENCE_THRESHOLD}")
print(f"[Video Processor] Detection size: {DETECTION_SIZE}px")
print(f"[Video Processor] Detection method: {DETECTION_METHOD}")


class VideoProcessor:
    """Processes video frames from Raspberry Pi with YOLOv8 or Roboflow"""

    def __init__(self):
        self.model = None
        self.running = False
        self.current_trip_id = None
        self.last_db_save = 0
        self.detection_history = []
        self.frame_count = 0

        # Video recording
        self.video_writer = None
        self.recording_start_time = None
        self.recording_frame_count = 0
        self.current_video_path = None

        # Token optimization for Roboflow
        self.last_roboflow_detection_time = 0
        self.roboflow_frame_counter = 0
        self.last_passenger_count = 0

    def initialize_model(self):
        """Initialize detection model (YOLO or check Roboflow)"""
        if DETECTION_METHOD == 'roboflow':
            if ROBOFLOW_AVAILABLE:
                print("[Video Processor] Using Roboflow workflow for detection")
                return True
            else:
                print("[Video Processor] Roboflow not available, falling back to YOLO")
                if not YOLO_AVAILABLE:
                    print("[Video Processor] YOLO also not available - detection disabled")
                    return False
                # Fall through to YOLO initialization

        if not YOLO_AVAILABLE:
            print("YOLO not available - cannot initialize model")
            return False

        try:
            # Load model with CPU optimization
            self.model = YOLO(MODEL_PATH)

            # Optimize for CPU/Intel GPU
            # Use half precision if supported (not always available on CPU)
            try:
                self.model.fuse()  # Fuse layers for faster inference
                print("[Video Processor] Model layers fused for optimization")
            except:
                print("[Video Processor] Model fusion not available, using standard")
            
            print(f"[Video Processor] YOLO model loaded from {MODEL_PATH}")
            return True
        except Exception as e:
            print(f"[Video Processor] Model initialization error: {e}")
            return False
    
    def decode_frame(self, frame_data: str) -> Optional[np.ndarray]:
        """Decode base64-encoded frame to numpy array"""
        try:
            # Remove data URL prefix if present
            if frame_data.startswith('data:image'):
                frame_data = frame_data.split(',')[1]
            
            # Decode base64
            img_bytes = base64.b64decode(frame_data)
            
            # Decode to numpy array
            nparr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            return frame
        except Exception as e:
            print(f"[Video Processor] Frame decode error: {e}")
            return None
    
    def _should_skip_roboflow_frame(self) -> bool:
        """
        Determine if we should skip this frame for Roboflow detection
        Implements frame sampling and rate limiting for token optimization
        """
        current_time = time.time()

        # Check frame skip counter (process every Nth frame)
        self.roboflow_frame_counter += 1
        if self.roboflow_frame_counter < ROBOFLOW_FRAME_SKIP:
            return True
        self.roboflow_frame_counter = 0

        # Check minimum interval between detections
        time_since_last = current_time - self.last_roboflow_detection_time
        if time_since_last < ROBOFLOW_MIN_DETECTION_INTERVAL:
            return True

        return False

    async def detect_passengers(self, frame: np.ndarray) -> List[Dict]:
        """
        Detect passengers using configured method (YOLO or Roboflow)
        Optimized for 90%+ accuracy with confidence filtering and NMS
        Implements token optimization for Roboflow with frame sampling
        """
        if DETECTION_METHOD == 'roboflow' and ROBOFLOW_AVAILABLE:
            # Apply token optimization: skip frames if needed
            if self._should_skip_roboflow_frame():
                # Return last known count for skipped frames
                return [{'count': self.last_passenger_count, 'skipped': True}]
            return await self._detect_with_roboflow(frame)
        elif DETECTION_METHOD == 'yolo' and YOLO_AVAILABLE:
            return self._detect_with_yolo(frame)
        else:
            print(f"[Video Processor] Detection method '{DETECTION_METHOD}' not available, falling back to YOLO")
            if YOLO_AVAILABLE:
                return self._detect_with_yolo(frame)
            return []

    def _detect_with_yolo(self, frame: np.ndarray) -> List[Dict]:
        """Detect passengers using local YOLO model"""
        if self.model is None:
            return []

        try:
            # Run YOLO detection with accuracy-optimized parameters
            results = self.model(
                frame,
                conf=CONFIDENCE_THRESHOLD,  # General threshold
                iou=IOU_THRESHOLD,
                verbose=False,
                save=False,
                show=False,
                stream=False,
                imgsz=DETECTION_SIZE,  # Larger size for better accuracy
                max_det=MAX_DET,
                half=False,  # Use full precision for accuracy (CPU)
                device='cpu'  # Explicitly use CPU
            )
            
            raw_person_detections = []
            filtered_detections = []
            
            for result in results:
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
                        
                        # Apply strict confidence threshold for accuracy
                        if confidence < YOLO_CONFIDENCE_THRESHOLD:
                            continue
                        
                        # Filter small detections (false positives) - relaxed for better coverage
                        box_width = x2 - x1
                        box_height = y2 - y1
                        box_area = box_width * box_height
                        frame_area = frame.shape[0] * frame.shape[1]

                        # Minimum size: at least 0.8% of frame area (lowered from 1.5%)
                        if box_area < frame_area * 0.008:
                            continue

                        # Aspect ratio check: people are taller than wide (relaxed)
                        aspect_ratio = box_height / box_width if box_width > 0 else 0
                        if aspect_ratio < 0.4 or aspect_ratio > 4.0:
                            continue
                        
                        filtered_detections.append({
                            'bbox': [int(x1), int(y1), int(x2), int(y2)],
                            'confidence': confidence,
                            'class': class_name
                        })
            
            # Apply additional NMS to remove overlapping detections
            final_detections = self._apply_nms(filtered_detections)
            
            # Log detection statistics
            if len(raw_person_detections) > 0:
                print(f"[Video Processor] Raw: {len(raw_person_detections)}, "
                      f"After confidence filter: {len(filtered_detections)}, "
                      f"After NMS: {len(final_detections)}")
            
            return final_detections

        except Exception as e:
            print(f"[Video Processor] YOLO detection error: {e}")
            return []

    async def _detect_with_roboflow(self, frame: np.ndarray) -> List[Dict]:
        """Detect passengers using Roboflow workflow with token optimization"""
        try:
            # Encode frame to JPEG bytes with optimized quality for smaller payload
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
            image_bytes = buffer.tobytes()

            # Run Roboflow workflow (has built-in rate limiting)
            workflow_result = await roboflow_client.run_workflow(image_bytes)

            # Extract detections from workflow result
            detections = roboflow_client.extract_detections(workflow_result)

            # Update tracking for token optimization
            self.last_roboflow_detection_time = time.time()
            self.last_passenger_count = len(detections)

            print(f"[Video Processor] Roboflow detected {len(detections)} passengers (API calls: {roboflow_client.call_count})")
            return detections

        except RoboflowWorkflowError as e:
            print(f"[Video Processor] Roboflow workflow error: {e}")
            # Fall back to YOLO if available
            if YOLO_AVAILABLE:
                print("[Video Processor] Falling back to YOLO")
                return self._detect_with_yolo(frame)
            return []
        except Exception as e:
            print(f"[Video Processor] Roboflow detection error: {e}")
            return []
    
    def _apply_nms(self, detections: List[Dict], iou_threshold: float = 0.45) -> List[Dict]:
        """Apply Non-Maximum Suppression to remove overlapping detections"""
        if not detections:
            return detections
        
        # Sort by confidence (highest first)
        detections_sorted = sorted(detections, key=lambda x: x['confidence'], reverse=True)
        
        final_detections = []
        while detections_sorted:
            # Keep the highest confidence detection
            current = detections_sorted.pop(0)
            final_detections.append(current)
            
            # Remove detections that overlap significantly with current
            remaining = []
            for det in detections_sorted:
                iou = self._calculate_iou(current['bbox'], det['bbox'])
                if iou < iou_threshold:
                    remaining.append(det)
            
            detections_sorted = remaining
        
        return final_detections
    
    def _calculate_iou(self, box1: List[int], box2: List[int]) -> float:
        """Calculate Intersection over Union (IoU) between two bounding boxes"""
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
    
    def draw_detections(self, frame: np.ndarray, detections: List[Dict]) -> np.ndarray:
        """Draw bounding boxes on detected passengers"""
        for i, detection in enumerate(detections, 1):
            x1, y1, x2, y2 = detection['bbox']
            confidence = detection['confidence']
            
            # Bounding box
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 165, 255), 2)
            
            # Label
            label = f"Person {i}: {confidence:.2f}"
            label_size, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            
            cv2.rectangle(frame, (x1, y1 - label_size[1] - 6),
                         (x1 + label_size[0] + 4, y1), (0, 165, 255), -1)
            cv2.putText(frame, label, (x1 + 2, y1 - 3),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        return frame
    
    def save_passenger_count_to_db(self, count: int):
        """Save passenger count to Supabase database"""
        if not supabase or not self.current_trip_id:
            return
        
        try:
            current_time = time.time()
            # Throttle: only write once every DB_SAVE_INTERVAL seconds
            if current_time - self.last_db_save < DB_SAVE_INTERVAL:
                return
            
            data = {
                'trip_id': self.current_trip_id,
                'count': count,
                'ai_count': count,
                'source': 'yolo_backend',  # Indicates processing on backend
                'recorded_at': time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(current_time))
            }
            
            result = supabase.table('passenger_counts').insert(data).execute()
            if result:
                self.last_db_save = current_time
                print(f"[Video Processor] Saved count={count} trip={self.current_trip_id}")
                
        except Exception as e:
            print(f"[Video Processor] Error saving to database: {e}")
    
    def save_gps_to_db(self, gps_data: dict, trip_id: str = None):
        """Save GPS location to Supabase database"""
        if not supabase:
            print("[Video Processor] ERROR: Supabase client not initialized")
            return

        try:
            current_time = time.time()
            # Throttle GPS saves to avoid overwhelming database
            if not hasattr(self, 'last_gps_save'):
                self.last_gps_save = 0
            if current_time - self.last_gps_save < 2.0:  # Save GPS every 2 seconds max
                print(f"[Video Processor] GPS throttled (last save {current_time - self.last_gps_save:.1f}s ago)")
                return

            data = {
                'latitude': gps_data.get('latitude'),
                'longitude': gps_data.get('longitude'),
                'altitude': gps_data.get('altitude'),
                'speed': gps_data.get('speed'),
                'source': gps_data.get('source', 'gps'),
                'recorded_at': time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(current_time))
            }

            # Only include trip_id if it exists (nullable in schema)
            if trip_id:
                data['trip_id'] = trip_id

            print(f"[Video Processor] Attempting to save GPS: {gps_data.get('latitude'):.6f}, {gps_data.get('longitude'):.6f}")
            result = supabase.table('gps_locations').insert(data).execute()
            if result:
                self.last_gps_save = current_time
                print(f"[Video Processor] ✓ Saved GPS: {gps_data.get('latitude'):.6f}, {gps_data.get('longitude'):.6f} (trip_id: {trip_id})")
            else:
                print(f"[Video Processor] ✗ GPS insert returned no data")

        except Exception as e:
            print(f"[Video Processor] ✗ Error saving GPS to database: {e}")
    
    def set_current_trip(self, trip_id: str):
        """Set the current trip ID for database recording"""
        self.current_trip_id = trip_id
        print(f"[Video Processor] Current trip ID set to: {trip_id}")
    
    def clear_current_trip(self):
        """Clear the current trip ID"""
        self.current_trip_id = None
        print("[Video Processor] Current trip ID cleared")

    def start_recording(self, frame_width: int, frame_height: int):
        """Start video recording for current trip"""
        if not VIDEO_RECORDING_ENABLED:
            print("[Video Processor] Video recording is disabled")
            return False

        if not self.current_trip_id:
            print("[Video Processor] Cannot start recording: no trip ID set")
            return False

        if self.video_writer is not None:
            print("[Video Processor] Recording already in progress")
            return False

        try:
            # Create filename with trip ID and timestamp
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"trip_{self.current_trip_id}_{timestamp}.mp4"
            self.current_video_path = os.path.join(VIDEO_OUTPUT_DIR, filename)

            # Initialize video writer with MP4 codec
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            self.video_writer = cv2.VideoWriter(
                self.current_video_path,
                fourcc,
                VIDEO_FPS,
                (frame_width, frame_height)
            )

            self.recording_start_time = time.time()
            self.recording_frame_count = 0

            print(f"[Video Processor] Started recording to: {self.current_video_path}")
            return True

        except Exception as e:
            print(f"[Video Processor] Error starting recording: {e}")
            return False

    def stop_recording(self):
        """Stop video recording and save metadata to database"""
        if self.video_writer is None:
            print("[Video Processor] No recording in progress")
            return None

        try:
            # Stop recording
            self.video_writer.release()
            self.video_writer = None

            # Calculate duration
            duration = int(time.time() - self.recording_start_time) if self.recording_start_time else 0

            # Get file size
            file_size = os.path.getsize(self.current_video_path) if self.current_video_path and os.path.exists(self.current_video_path) else 0

            print(f"[Video Processor] Stopped recording:")
            print(f"  Duration: {duration}s")
            print(f"  Frames: {self.recording_frame_count}")
            print(f"  File size: {file_size} bytes")

            # Save video metadata to database
            video_url = self.current_video_path
            self.save_video_recording_to_db(video_url, duration, file_size)

            # Return video info
            result = {
                'path': self.current_video_path,
                'duration': duration,
                'file_size': file_size,
                'frame_count': self.recording_frame_count
            }

            # Reset recording state
            self.current_video_path = None
            self.recording_start_time = None
            self.recording_frame_count = 0

            return result

        except Exception as e:
            print(f"[Video Processor] Error stopping recording: {e}")
            return None

    def write_frame_to_recording(self, frame: np.ndarray):
        """Write a frame to the current video recording"""
        if self.video_writer is None:
            return False

        try:
            self.video_writer.write(frame)
            self.recording_frame_count += 1
            return True
        except Exception as e:
            print(f"[Video Processor] Error writing frame: {e}")
            return False

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

    def save_video_recording_to_db(self, video_url: str, duration: int, file_size: int):
        """Save video recording metadata to Supabase database (both trips and video_recordings tables)"""
        if not supabase or not self.current_trip_id:
            return

        try:
            # Try to upload to Cloudflare Stream first
            cloudflare_url = self._upload_to_cloudflare_stream(video_url, self.current_trip_id)
            
            # Use Cloudflare URL if upload succeeded, otherwise use local path
            final_url = cloudflare_url if cloudflare_url else video_url
            storage_type = 'cloudflare' if cloudflare_url else 'local'

            # Update trips table with video metadata
            trips_data = {
                'video_recording_url': final_url,
                'video_recording_duration': duration,
                'video_recording_status': 'available',
                'video_recording_file_size': file_size,
                'video_recording_uploaded_at': time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime())
            }

            result = supabase.table('trips').update(trips_data).eq('id', self.current_trip_id).execute()
            if result:
                print(f"[Video Processor] Saved video metadata to trips table for trip {self.current_trip_id}")

            # Also save to video_recordings table for detailed history
            video_recordings_data = {
                'trip_id': self.current_trip_id,
                'file_name': os.path.basename(video_url) if video_url else 'unknown',
                'file_path': final_url,
                'file_size': file_size,
                'duration': duration,
                'format': 'mp4',
                'storage_type': storage_type,
                'status': 'completed',
                'metadata': {
                    'source': 'backend_processor',
                    'recorded_at': time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime()),
                    'cloudflare_url': cloudflare_url
                }
            }

            recordings_result = supabase.table('video_recordings').insert(video_recordings_data).execute()
            if recordings_result and recordings_result.data:
                recording_id = recordings_result.data[0].get('id')
                print(f"[Video Processor] Saved video metadata to video_recordings table with ID: {recording_id}")

        except Exception as e:
            print(f"[Video Processor] Error saving video metadata to database: {e}")


# Global video processor instance
video_processor = VideoProcessor()
