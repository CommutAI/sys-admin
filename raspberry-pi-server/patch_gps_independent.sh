#!/bin/bash
# Patch script to make GPS work independently of camera

cd ~/raspberry-pi-server

# Backup first
cp video_server_stream_only.py video_server_stream_only.py.backup

# Apply the GPS independent upload changes
python3 << 'EOF'
with open('video_server_stream_only.py', 'r') as f:
    content = f.read()

# Add global current_trip_id variable
if 'current_trip_id = None' not in content:
    content = content.replace(
        'print(f"[Stream Mode] Camera: {CAMERA_WIDTH}x{CAMERA_HEIGHT} @ {FPS}fps")',
        '''print(f"[Stream Mode] Camera: {CAMERA_WIDTH}x{CAMERA_HEIGHT} @ {FPS}fps")

# Global variable to track current trip ID
current_trip_id = None'''
    )

# Update set_current_trip to set global variable
content = content.replace(
    '''def set_current_trip(self, trip_id):
        """Set current trip ID"""
        self.current_trip_id = trip_id
        print(f"Current trip ID set to: {trip_id}")''',
    '''def set_current_trip(self, trip_id):
        """Set current trip ID"""
        self.current_trip_id = trip_id
        global current_trip_id
        current_trip_id = trip_id
        print(f"Current trip ID set to: {trip_id}")'''
)

# Update clear_current_trip to clear global variable
content = content.replace(
    '''def clear_current_trip(self):
        """Clear current trip ID"""
        self.current_trip_id = None
        print("Current trip ID cleared")''',
    '''def clear_current_trip(self):
        """Clear current trip ID"""
        self.current_trip_id = None
        global current_trip_id
        current_trip_id = None
        print("Current trip ID cleared")'''
)

# Add send_gps_to_backend function
if 'async def send_gps_to_backend' not in content:
    content = content.replace(
        '''def stop(self):
        """Stop streaming"""
        self.running = False
        if self.camera:
            self.camera.release()
        if self.websocket:
            asyncio.create_task(self.websocket.close())
        print("Video stream stopped")''',
        '''def stop(self):
        """Stop streaming"""
        self.running = False
        if self.camera:
            self.camera.release()
        if self.websocket:
            asyncio.create_task(self.websocket.close())
        print("Video stream stopped")


async def send_gps_to_backend():
    """Send GPS data to backend independently of video stream"""
    if not hardware_manager:
        print("Hardware manager not available, GPS upload disabled")
        return

    backend_ws_url = BACKEND_URL.replace('http://', 'ws://') + '/ws/video-stream/pi-' + BUS_NUMBER

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
            else:
                print("[GPS Upload] No GPS location available yet")

        except Exception as e:
            print(f"[GPS Upload] Error: {e}")

        # Send GPS every 5 seconds
        await asyncio.sleep(5)'''
    )

# Update main function to start GPS task
content = content.replace(
    '''async def main():
    """Main entry point"""
    streamer = VideoStreamer()

    try:
        await streamer.stream_frames()
    except KeyboardInterrupt:
        print("\\nShutting down...")
        streamer.stop()''',
    '''async def main():
    """Main entry point"""
    streamer = VideoStreamer()

    try:
        # Start GPS upload task independently
        gps_task = asyncio.create_task(send_gps_to_backend())

        # Start video streaming
        await streamer.stream_frames()
    except KeyboardInterrupt:
        print("\\nShutting down...")
        streamer.stop()
        gps_task.cancel()'''
)

with open('video_server_stream_only.py', 'w') as f:
    f.write(content)

print("✅ GPS independent upload patch applied successfully")
EOF

echo "✅ Patch applied! Run 'python3 video_server_stream_only.py' to test"
