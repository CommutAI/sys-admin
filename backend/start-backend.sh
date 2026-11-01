#!/bin/bash
# CommutAI Backend - Startup Script (Linux/Mac)
# This script starts the backend server

echo "=========================================="
echo "CommutAI Backend - Starting Server"
echo "=========================================="

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR"

# Check if venv exists
if [ ! -d "$BACKEND_DIR/venv" ]; then
    echo "ERROR: Virtual environment not found"
    echo "Please create it first: python3 -m venv venv"
    exit 1
fi

# Activate virtual environment
source "$BACKEND_DIR/venv/bin/activate"

# Check if .env exists
if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo "WARNING: .env file not found"
    echo "Creating from .env.example if it exists..."
    if [ -f "$BACKEND_DIR/.env.example" ]; then
        cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
        echo "Please configure your .env file with proper credentials"
    fi
fi

# Start the backend server
echo "Starting backend server on http://localhost:8000"
echo "Press Ctrl+C to stop"
echo ""

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
