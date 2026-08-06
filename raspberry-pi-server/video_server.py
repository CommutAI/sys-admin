#!/usr/bin/env python3
"""
Raspberry Pi Video Server for Bus Monitoring
Captures video from EMEET C60E Dual Camera 4K Webcam
Performs AI passenger detection and streams via WebSocket
"""

import cv2
import numpy as np
import base64
import json
import time
from flask import Flask
from flask_socketio import SocketIO, emit
from ultralytics import YOLO
import threading
import queue

app = Flask(__name__)
app.config['SECRET_KEY'] = 'bus-monitoring-secret-key'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Camera configuration
CAMERA_ID = 0  # Default camera, can be changed for dual camera setup
CAMERA_WIDTH = 1280
CAMERA_HEIGHT = 720
FPS = 15

# AI Model configuration
MODEL_PATH = 'yolov8n.pt'  # Lightweight model for Raspberry Pi
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
    
    def process_frames(self):
        """Main processing loop"""
        print("Starting video processing...")
        
        while self.running:
            try:
                ret, frame = self.camera.read()
                if not ret:
                    print("Error: Could not read frame")
                    time.sleep(0.1)
                    continue
                
                # Detect passengers
                detections = self.detect_passengers(frame)
                self.passenger_count = len(detections)
                
                # Store detection history (last 30 frames)
                self.detection_history.append(self.passenger_count)
                if len(self.detection_history) > 30:
                    self.detection_history.pop(0)
                
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
                    socketio.emit('passenger_count', {
                        'count': self.passenger_count,
                        'timestamp': time.time(),
                        'average_count': sum(self.detection_history) / len(self.detection_history) if self.detection_history else 0
                    })
                
                # Control frame rate
                time.sleep(1.0 / FPS)
                
            except Exception as e:
                print(f"Processing error: {e}")
                time.sleep(0.1)
    
    def start(self):
        """Start video processing"""
        if not self.initialize_camera():
            return False
        
        if not self.initialize_model():
            return False
        
        self.running = True
        self.processing_thread = threading.Thread(target=self.process_frames)
        self.processing_thread.daemon = True
        self.processing_thread.start()
        return True
    
    def stop(self):
        """Stop video processing"""
        self.running = False
        if self.camera:
            self.camera.release()
        print("Video processing stopped")

# Global video processor
video_processor = VideoProcessor()

@app.route('/')
def index():
    return "Bus Monitoring Video Server Running"

@app.route('/health')
def health():
    return json.dumps({
        'status': 'healthy',
        'camera_active': video_processor.camera is not None and video_processor.camera.isOpened(),
        'passenger_count': video_processor.passenger_count
    })

@socketio.on('connect')
def handle_connect():
    print('Client connected')
    emit('status', {'message': 'Connected to video server'})

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

@socketio.on('start_stream')
def start_stream():
    """Start video streaming"""
    if not video_processor.running:
        if video_processor.start():
            emit('status', {'message': 'Video stream started'})
        else:
            emit('error', {'message': 'Failed to start video stream'})
    else:
        emit('status', {'message': 'Video stream already running'})

@socketio.on('stop_stream')
def stop_stream():
    """Stop video streaming"""
    video_processor.stop()
    emit('status', {'message': 'Video stream stopped'})

def stream_frames():
    """Background task to stream frames"""
    while video_processor.running:
        try:
            if not video_processor.frame_queue.empty():
                frame_base64 = video_processor.frame_queue.get_nowait()
                socketio.emit('video_frame', {'frame': frame_base64})
            time.sleep(1.0 / FPS)
        except Exception as e:
            print(f"Streaming error: {e}")
            time.sleep(0.1)

if __name__ == '__main__':
    print("Starting Bus Monitoring Video Server...")
    print(f"Camera ID: {CAMERA_ID}")
    print(f"Resolution: {CAMERA_WIDTH}x{CAMERA_HEIGHT}")
    print(f"FPS: {FPS}")
    
    # Start frame streaming thread
    streaming_thread = threading.Thread(target=stream_frames)
    streaming_thread.daemon = True
    streaming_thread.start()
    
    # Run Flask-SocketIO server
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
