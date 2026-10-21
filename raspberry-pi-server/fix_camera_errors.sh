#!/bin/bash
# Patch script to improve camera error messages on Raspberry Pi

cd ~/raspberry-pi-server

# Backup first
cp video_server_stream_only.py video_server_stream_only.py.backup

# Apply the error message improvements
python3 << 'EOF'
with open('video_server_stream_only.py', 'r') as f:
    content = f.read()

# Replace camera open error
content = content.replace(
    'print(f"Error: Could not open camera at {CAMERA_DEVICE}")',
    '''print(f"❌ CAMERA ERROR: Could not open camera at {CAMERA_DEVICE}")
                print(f"   Troubleshooting steps:")
                print(f"   1. Check if camera is connected to Raspberry Pi")
                print(f"   2. Run: ls -la /dev/video* to list available camera devices")
                print(f"   3. Try: sudo modprobe bcm2835-v4l2")
                print(f"   4. Enable camera: sudo raspi-config → Interface Options → Camera")
                print(f"   5. Check camera cable connection")'''
)

# Replace test frame error
content = content.replace(
    'print("Error: Could not read test frame")',
    '''print("❌ CAMERA ERROR: Could not read test frame")
                print(f"   Camera may be in use by another process")
                print(f"   Try: sudo pkill -f python3 to stop other camera processes")
                print(f"   Or: sudo libcamera-hello to test camera directly")'''
)

# Replace initialization error
content = content.replace(
    'print(f"Camera initialization error: {e}")',
    '''print(f"❌ CAMERA ERROR: Initialization failed - {e}")
                print(f"   Check if camera is properly connected and permissions are correct")'''
)

# Replace success message
content = content.replace(
    'print(f"Camera initialized: {actual_width}x{actual_height} @ {actual_fps}fps")',
    'print(f"✅ Camera initialized: {actual_width}x{actual_height} @ {actual_fps}fps")'
)

with open('video_server_stream_only.py', 'w') as f:
    f.write(content)

print("✅ Camera error messages updated successfully")
EOF

echo "✅ Patch applied! Run 'python3 video_server_stream_only.py' to test"
