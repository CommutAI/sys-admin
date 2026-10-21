#!/bin/bash
# Patch script to add GPS integration to video_server_stream_only.py

cd ~/raspberry-pi-server

# Backup the original file
cp video_server_stream_only.py video_server_stream_only.py.backup

# Use Python to make the modification
python3 << 'PYTHON_EOF'
import re

# Read the file
with open('video_server_stream_only.py', 'r') as f:
    content = f.read()

# Find the message creation section and replace it
old_pattern = r"""                # Send frame to backend immediately \(don't wait for response\)
                message = \{
                    'type': 'frame',
                    'frame': frame_data,
                    'timestamp': time\.time\(\),
                    'bus_number': BUS_NUMBER
                \}"""

new_code = """                # Get current GPS location if available
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
                }"""

# Replace the old pattern with new code
content = re.sub(old_pattern, new_code, content)

# Write back
with open('video_server_stream_only.py', 'w') as f:
    f.write(content)

print("✅ GPS integration added to video_server_stream_only.py")
PYTHON_EOF

echo "✅ Patch applied successfully"
echo "Now restart the video server to apply changes"
