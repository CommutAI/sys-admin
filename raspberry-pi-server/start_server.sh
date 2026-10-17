#!/bin/bash
# Auto-start script for Raspberry Pi Video Server
# This script auto-installs dependencies and starts the server

echo "🚀 Starting Raspberry Pi Video Server Setup..."

# Navigate to script directory
cd "$(dirname "$0")"

# Step 1: Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Step 2: Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Step 3: Install/upgrade dependencies
echo "📥 Installing dependencies..."
pip install --upgrade pip
pip install fastapi uvicorn python-dotenv supabase opencv-python numpy ultralytics

# Step 4: Check if .env exists, create if not
if [ ! -f ".env" ]; then
    echo "⚙️  Creating .env file..."
    cat > .env << 'ENVEOF'
# Supabase Configuration
SUPABASE_URL=https://iyacktzzktwrpeibcena.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5YWNrdHp6a3R3cnBlaWJjZW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNzAxMzMsImV4cCI6MjEwNjY0NjEzM30.nnUW_wjKE9t6V_ZNNR1u_HqcqQletGEsJ4A2kcBLxl0

# Bus Configuration
BUS_NUMBER=1

# Server Configuration
PORT=5000

# Camera Configuration
ENABLE_CAMERA=true
CAMERA_ID=0
CAMERA_WIDTH=640
CAMERA_HEIGHT=480
FPS=10

# AI Configuration
DISABLE_AI=false
COUNT_METHOD=yolo
MODEL_PATH=yolov8n.pt
CONFIDENCE_THRESHOLD=0.25
YOLO_CONFIDENCE_THRESHOLD=0.60

# Performance Settings
ENABLE_REALTIME_MODE=false
SKIP_DETECTION_FRAMES=2
FRAME_QUEUE_SIZE=5
DISABLE_DRAWING=false
DISABLE_DB_WRITES=false
ENVEOF
    echo "✅ .env file created"
fi

# Step 5: Fix Python file indentation (if needed)
echo "🔍 Checking Python file indentation..."
python3 -m py_compile video_server_fastapi.py 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  Python file has syntax errors, attempting to fix..."
    # Re-indent the file using Python
    python3 << 'PYEOF'
import re

with open('video_server_fastapi.py', 'r') as f:
    content = f.read()

# Fix common indentation issues
lines = content.split('\n')
fixed_lines = []
indent_stack = [0]

for line in lines:
    stripped = line.lstrip()
    if not stripped or stripped.startswith('#'):
        fixed_lines.append(line)
        continue
    
    # Calculate current indent
    indent = len(line) - len(stripped)
    
    # Fix inconsistent indentation
    if stripped.startswith('def ') or stripped.startswith('class '):
        indent_stack.append(indent)
    elif stripped and not line.startswith(' ') and not line.startswith('\t'):
        # No indent but should have one
        indent = indent_stack[-1] if indent_stack else 0
        line = ' ' * indent + stripped
    
    fixed_lines.append(line)

with open('video_server_fastapi.py', 'w') as f:
    f.write('\n'.join(fixed_lines))

print("Indentation fix attempted")
PYEOF
fi

# Step 6: Start the server
echo "🎬 Starting video server..."
echo "📍 The server will auto-detect and register its IP in the database"
echo "🔄 IP will be updated every 30 seconds automatically"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

uvicorn video_server_fastapi:app --host 0.0.0.0 --port 5000
