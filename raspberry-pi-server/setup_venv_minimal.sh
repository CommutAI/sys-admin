#!/bin/bash

echo "=========================================="
echo "Setting up Python virtual environment (Minimal - No AI)"
echo "=========================================="

# Create virtual environment
echo "Creating virtual environment..."
python3 -m venv venv

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip -i https://pypi.org/simple

# Install dependencies from minimal requirements (no AI/torch)
echo "Installing dependencies (minimal - no AI)..."
pip install -r requirements-minimal.txt

echo "=========================================="
echo "Virtual environment setup complete!"
echo "=========================================="
echo "To run the server:"
echo "1. Activate the environment: source venv/bin/activate"
echo "2. Create .env file with DISABLE_AI=true"
echo "3. Run the server: python video_server_fastapi.py"
echo "4. Deactivate when done: deactivate"
