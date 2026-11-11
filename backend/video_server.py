"""
Local Video Recording Server
Handles video recording with EMEET C60E camera and uploads to Cloudflare Stream
"""

import cv2
import os
import time
import json
import requests
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

# Configuration
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
CLOUDFLARE_ACCOUNT_ID = os.getenv('CLOUDFLARE_ACCOUNT_ID')
CLOUDFLARE_API_TOKEN = os.getenv('CLOUDFLARE_API_TOKEN')
CLOUDFLARE_ENABLED = os.getenv('CLOUDFLARE_ENABLED', 'false').lower() == 'true'
VIDEO_OUTPUT_DIR = os.getenv('VIDEO_OUTPUT_DIR', './recordings')
VIDEO_FPS = int(os.getenv('VIDEO_FPS', '15'))
VIDEO_QUALITY = int(os.getenv('VIDEO_QUALITY', '40'))

# Initialize Supabase
supabase = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✓ Supabase client initialized")
    except Exception as e:
        print(f"✗ Failed to initialize Supabase: {e}")

class VideoRecorder:
    def __init__(self):
        self.camera = None
        self.video_writer = None
        self.current_trip_id = None
        self.recording = False
        self.recording_start_time = None
        self.frame_count = 0

    def start_camera(self):
        """Open camera"""
        try:
            self.camera = cv2.VideoCapture(0)  # Default camera (EMEET C60E)
            if not self.camera.isOpened():
                print("✗ Failed to open camera")
                return False
            
            # Get camera properties
            width = int(self.camera.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(self.camera.get(cv2.CAP_PROP_FRAME_HEIGHT))
            print(f"✓ Camera opened: {width}x{height}")
            return True
        except Exception as e:
            print(f"✗ Error opening camera: {e}")
            return False

    def start_recording(self, trip_id):
        """Start recording video"""
        if not self.camera or not self.camera.isOpened():
            print("✗ Camera not opened")
            return False

        try:
            self.current_trip_id = trip_id
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"trip_{trip_id}_{timestamp}.mp4"
            video_path = os.path.join(VIDEO_OUTPUT_DIR, filename)

            # Create recordings directory if it doesn't exist
            os.makedirs(VIDEO_OUTPUT_DIR, exist_ok=True)

            # Initialize video writer
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            self.video_writer = cv2.VideoWriter(video_path, fourcc, VIDEO_FPS, (int(self.camera.get(cv2.CAP_PROP_FRAME_WIDTH)), int(self.camera.get(cv2.CAP_PROP_FRAME_HEIGHT))))

            if not self.video_writer.isOpened():
                print("✗ Failed to initialize video writer")
                return False

            self.recording = True
            self.recording_start_time = time.time()
            self.frame_count = 0
            self.current_video_path = video_path
            print(f"✓ Recording started: {video_path}")
            return True

        except Exception as e:
            print(f"✗ Error starting recording: {e}")
            return False

    def record_frame(self, frame):
        """Write a frame to the video"""
        if not self.recording or not self.video_writer:
            return False

        try:
            self.video_writer.write(frame)
            self.frame_count += 1
            return True
        except Exception as e:
            print(f"✗ Error writing frame: {e}")
            return False

    def stop_recording(self):
        """Stop recording and upload to Cloudflare"""
        if not self.recording:
            print("✗ No recording in progress")
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

            print(f"✓ Recording stopped: {self.current_video_path}")
            print(f"  Duration: {duration}s, Frames: {self.frame_count}, Size: {file_size} bytes")

            # Upload to Cloudflare Stream
            playback_url = self._upload_to_cloudflare_stream(self.current_video_path, self.current_trip_id)

            # Save to database
            self._save_to_database(playback_url if playback_url else self.current_video_path, duration, file_size)

            # Reset state
            self.current_video_path = None
            self.recording_start_time = None
            self.frame_count = 0

            return {
                'file_path': self.current_video_path,
                'duration': duration,
                'file_size': file_size,
                'playback_url': playback_url
            }

        except Exception as e:
            print(f"✗ Error stopping recording: {e}")
            return None

    def _upload_to_cloudflare_stream(self, video_path, trip_id):
        """Upload video to Cloudflare Stream"""
        if not CLOUDFLARE_ENABLED or not CLOUDFLARE_ACCOUNT_ID or not CLOUDFLARE_API_TOKEN:
            print("[Cloudflare] Cloudflare Stream not configured - skipping upload")
            return None

        if not video_path or not os.path.exists(video_path):
            print(f"[Cloudflare] Video file not found: {video_path}")
            return None

        try:
            print(f"[Cloudflare] Uploading to Cloudflare Stream: {video_path}")

            url = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/stream"
            headers = {'Authorization': f'Bearer {CLOUDFLARE_API_TOKEN}'}

            with open(video_path, 'rb') as video_file:
                files = {'file': (os.path.basename(video_path), video_file, 'video/mp4')}
                params = {
                    'metadata': json.dumps({
                        'trip_id': trip_id,
                        'recorded_at': datetime.now().isoformat()
                    })
                }

                response = requests.post(url, headers=headers, files=files, params=params, timeout=300)

            if response.status_code == 200:
                result = response.json()
                if result.get('success'):
                    video_uid = result['result']['uid']
                    playback_url = f"https://watch.cloudflarestream.com/{video_uid}"
                    print(f"[Cloudflare] ✓ Upload successful! Playback URL: {playback_url}")
                    return playback_url
                else:
                    print(f"[Cloudflare] ✗ Upload failed: {result.get('errors')}")
                    return None
            else:
                print(f"[Cloudflare] ✗ Upload failed with status {response.status_code}: {response.text}")
                return None

        except Exception as e:
            print(f"[Cloudflare] ✗ Upload error: {e}")
            return None

    def _save_to_database(self, video_url, duration, file_size):
        """Save recording metadata to database"""
        if not supabase or not self.current_trip_id:
            return

        try:
            # Update trips table
            trips_data = {
                'video_recording_url': video_url,
                'video_recording_duration': duration,
                'video_recording_status': 'available',
                'video_recording_file_size': file_size,
                'video_recording_uploaded_at': datetime.now().isoformat()
            }

            result = supabase.table('trips').update(trips_data).eq('id', self.current_trip_id).execute()
            if result:
                print(f"[DB] ✓ Updated trips table for trip {self.current_trip_id}")

            # Insert into video_recordings table
            video_recordings_data = {
                'trip_id': self.current_trip_id,
                'file_name': os.path.basename(video_url) if video_url else 'unknown',
                'file_path': video_url,
                'file_size': file_size,
                'duration': duration,
                'format': 'mp4',
                'storage_type': 'cloudflare' if 'cloudflarestream.com' in video_url else 'local',
                'status': 'completed',
                'metadata': {
                    'source': 'local_backend',
                    'recorded_at': datetime.now().isoformat()
                }
            }

            recordings_result = supabase.table('video_recordings').insert(video_recordings_data).execute()
            if recordings_result and recordings_result.data:
                print(f"[DB] ✓ Saved to video_recordings table")

        except Exception as e:
            print(f"[DB] ✗ Error saving to database: {e}")

# Global recorder instance
recorder = VideoRecorder()

def poll_active_trips():
    """Poll Supabase for active trips and handle recording"""
    if not supabase:
        print("✗ Supabase not initialized - cannot poll for trips")
        return

    print("✓ Started trip polling (every 10 seconds)")
    last_trip_id = None

    while True:
        try:
            # Query for active trips (not ended)
            response = supabase.table('trips').select('id, end_time').is_('end_time', 'null').order('start_time', desc=True).limit(1).execute()

            if response.data and len(response.data) > 0:
                current_trip = response.data[0]
                current_trip_id = current_trip['id']

                if current_trip_id != last_trip_id:
                    if recorder.recording:
                        # Stop previous recording
                        print(f"[Trip Poll] Trip changed - stopping recording for {last_trip_id}")
                        recorder.stop_recording()

                    # Start new recording
                    print(f"[Trip Poll] New active trip detected: {current_trip_id}")
                    if recorder.start_recording(current_trip_id):
                        last_trip_id = current_trip_id
                else:
                    # Continue recording for current trip
                    if not recorder.recording and last_trip_id:
                        print(f"[Trip Poll] Resuming recording for {last_trip_id}")
                        recorder.start_recording(last_trip_id)
            else:
                # No active trip - stop recording
                if recorder.recording:
                    print(f"[Trip Poll] No active trip - stopping recording")
                    recorder.stop_recording()
                    last_trip_id = None

        except Exception as e:
            print(f"[Trip Poll] Error checking trips: {e}")

        time.sleep(10)

if __name__ == '__main__':
    print("Local Video Recording Server")
    print("=" * 50)
    
    if recorder.start_camera():
        print("✓ Camera opened successfully")
        print("✓ Started automatic trip polling")
        print("✓ Server will automatically start/stop recording based on active trips")
        print("\nPress Ctrl+C to stop\n")
        
        # Start trip polling in background
        import threading
        poll_thread = threading.Thread(target=poll_active_trips, daemon=True)
        poll_thread.start()
        
        # Keep main thread alive
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down...")
            if recorder.recording:
                recorder.stop_recording()
            if recorder.camera:
                recorder.camera.release()
            print("Server stopped")
    else:
        print("✗ Failed to start camera - exiting")
