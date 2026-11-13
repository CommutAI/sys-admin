#!/usr/bin/env python3
"""
Fix the broken video_server_stream_only.py file
Run this on the Raspberry Pi: python3 fix_camera_file.py
"""

import re

# Read the broken file
with open('video_server_stream_only.py', 'r') as f:
    content = f.read()

# Fix the broken line 206 - replace the multi-line mess with single line
content = re.sub(
    r'# Open with explicit V4L2 backend — required for USB cameras on Raspberry Pi/OpenCV builds\n            self\.camera = cv2\.VideoCapture\(CAMERA_DEVICE, cv2\.CAP_V4L2\)',
    'self.camera = cv2.VideoCapture(CAMERA_DEVICE, cv2.CAP_V4L2)',
    content
)

# Add the comment on a separate line before
content = re.sub(
    r'(            if self\.camera is not None:.*?self\.camera\.release\(\)\n\n)',
    r'\1            # Open with explicit V4L2 backend — required for USB cameras on Raspberry Pi/OpenCV builds\n',
    content
)

# Fix any remaining double lines
content = re.sub(r'\n\n\n', '\n\n', content)

# Write the fixed file
with open('video_server_stream_only.py', 'w') as f:
    f.write(content)

print("✅ File fixed!")
print("Run: python3 video_server_stream_only.py")
