"""
Video Processing Service for CommutAI System
Receives raw video frames from Raspberry Pi and processes them with YOLOv8
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
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# AI Model imports
try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    print("Warning: ultralytics not installed - AI detection disabled")

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
supabase: Optional[Client] = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("Video processor: Supabase client initialized")
    except Exception as e:
        print(f"Video processor: Failed to initialize Supabase: {e}")

# Model configuration - Optimized for 90%+ accuracy
MODEL_PATH = os.getenv('MODEL_PATH', 'yolov8m.pt')  # Use medium model for better accuracy
CONFIDENCE_THRESHOLD = float(os.getenv('CONFIDENCE_THRESHOLD', '0.50'))  # Higher confidence for accuracy
IOU_THRESHOLD = float(os.getenv('IOU_THRESHOLD', '0.45'))
YOLO_CONFIDENCE_THRESHOLD = float(os.getenv('YOLO_CONFIDENCE_THRESHOLD', '0.70'))  # Very high for accuracy
DETECTION_SIZE = int(os.getenv('DETECTION_SIZE', '640'))  # Larger detection size for accuracy
MAX_DET = int(os.getenv('MAX_DET', '20'))  # Maximum detections per frame

# Passenger detection classes (COCO dataset)
PASSENGER_CLASSES = ['person']

# Database save interval (seconds)
DB_SAVE_INTERVAL = int(os.getenv('DB_SAVE_INTERVAL', '5'))

print(f"[Video Processor] Model: {MODEL_PATH}")
print(f"[Video Processor] Confidence threshold: {YOLO_CONFIDENCE_THRESHOLD}")
print(f"[Video Processor] Detection size: {DETECTION_SIZE}px")


class VideoProcessor:
    """Processes video frames from Raspberry Pi with YOLOv8 for high accuracy"""
    
    def __init__(self):
        self.model = None
        self.running = False
        self.current_trip_id = None
        self.last_db_save = 0
        self.detection_history = []
        self.frame_count = 0
        
    def initialize_model(self):
        """Initialize YOLOv8 model with accuracy optimizations"""
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
    
    def detect_passengers(self, frame: np.ndarray) -> List[Dict]:
        """
        Detect passengers with high accuracy using YOLOv8
        Optimized for 90%+ accuracy with confidence filtering and NMS
        """
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
                        
                        # Filter small detections (false positives)
                        box_width = x2 - x1
                        box_height = y2 - y1
                        box_area = box_width * box_height
                        frame_area = frame.shape[0] * frame.shape[1]
                        
                        # Minimum size: at least 1.5% of frame area
                        if box_area < frame_area * 0.015:
                            continue
                        
                        # Aspect ratio check: people are taller than wide
                        aspect_ratio = box_height / box_width if box_width > 0 else 0
                        if aspect_ratio < 0.6 or aspect_ratio > 3.5:
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
            print(f"[Video Processor] Detection error: {e}")
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
    
    def set_current_trip(self, trip_id: str):
        """Set the current trip ID for database recording"""
        self.current_trip_id = trip_id
        print(f"[Video Processor] Current trip ID set to: {trip_id}")
    
    def clear_current_trip(self):
        """Clear the current trip ID"""
        self.current_trip_id = None
        print("[Video Processor] Current trip ID cleared")


# Global video processor instance
video_processor = VideoProcessor()
