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

app = FastAPI(title="Bus Monitoring Video Server")

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
        'connected_clients': len(video_processor.websocket_clients)
    })

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
    print("Starting Bus Monitoring Video Server (FastAPI)...")
    print(f"Camera ID: {CAMERA_ID}")
    print(f"Resolution: {CAMERA_WIDTH}x{CAMERA_HEIGHT}")
    print(f"FPS: {FPS}")
    
    uvicorn.run(app, host='0.0.0.0', port=5000)
